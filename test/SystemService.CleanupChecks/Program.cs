using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Text;
using System.Text.Json;
using AutoMapper;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Protos;
using Blocks.SystemService.Services.CoreFeature.Auth;
using Blocks.SystemService.Services.CoreFeature.User;
using Blocks.SystemService.Services.SystemGrpc;
using Google.Protobuf.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: dotnet run --project test/SystemService.CleanupChecks -- <mode>");
    Console.Error.WriteLine("Supported modes: auth, contract, runtime");
    return 1;
}

var mode = args[0].TrimStart('-').ToLowerInvariant();

if (mode == "auth")
{
    try
    {
        await RunAuthChecksAsync();
        return Environment.ExitCode;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Fatal error in auth checks: {ex.Message}");
        return 1;
    }
}
else if (mode == "contract" || mode == "runtime")
{
    try
    {
        if (mode == "contract")
            RunContractChecks();
        else
            await RunRuntimeChecksAsync();
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"{mode} check failed: {ex.Message}");
        return 1;
    }
}
else
{
    Console.Error.WriteLine($"Unknown mode: {args[0]}");
    return 1;
}

void Assert(bool condition, string name)
{
    if (!condition)
    {
        throw new InvalidOperationException($"Assertion failed: {name}");
    }
}

string CreateTestJwt(Guid userId, string username, Guid roleId, string key, DateTime? expires = null, DateTime? notBefore = null)
{
    var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
    var claims = new[]
    {
        new System.Security.Claims.Claim("name", userId.ToString()),
        new System.Security.Claims.Claim("unique_name", username),
        new System.Security.Claims.Claim("role", roleId.ToString())
    };
    var now = DateTime.UtcNow;
    var nbf = notBefore ?? now.AddMinutes(-5);
    var exp = expires ?? now.AddHours(1);
    var token = new JwtSecurityToken(
        issuer: "systemservice-cleanup-checks",
        audience: "systemservice-cleanup-checks",
        claims: claims,
        notBefore: nbf,
        expires: exp,
        signingCredentials: credentials);
    return new JwtSecurityTokenHandler().WriteToken(token);
}

async Task<WebApplication> StartTestAppAsync(IConfiguration configuration, bool http2 = false)
{
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
    builder.Host.UseDefaultServiceProvider(options =>
    {
        options.ValidateScopes = true;
        options.ValidateOnBuild = true;
    });
    builder.Configuration.Sources.Clear();
    builder.Configuration.AddConfiguration(configuration);

    builder.Services.AddControllers(options =>
    {
        options.Filters.AddService<Blocks.SystemService.Infrastructure.Filters.AuditActionFilter>();
    }).AddApplicationPart(typeof(UserController).Assembly);

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
    builder.ExecuteConfigService();
    builder.ExecuteConfigAuthentication();

    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Listen(System.Net.IPAddress.Loopback, 0, listenOptions =>
        {
            listenOptions.Protocols = http2
                ? Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http2
                : Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1;
        });
    });

    var app = builder.Build();
    app.UseMiddleware<Blocks.SystemService.Middlewares.GlobalExceptionHandler>();
    app.UseSwagger();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapGrpcService<SystemGrpcService>();

    await app.StartAsync();
    return app;
}

async Task RunRuntimeChecksAsync()
{
    Assert(Environment.Version.Major == 10, "checks run on .NET 10");
    Assert(typeof(DbContext).Assembly.GetName().Version!.Major == 10, "EF Core 10 loaded");
    Assert(typeof(Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure.NpgsqlDbContextOptionsBuilder)
        .Assembly.GetName().Version!.Major == 10, "Npgsql EF Core provider 10 loaded");

    var runtimeConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:System"] = "Host=127.0.0.1;Port=1;Database=unused;Username=unused",
        ["Jwt:Key"] = new string('x', 64),
        ["Jwt:Issuer"] = "systemservice-cleanup-checks",
        ["Jwt:Audience"] = "systemservice-cleanup-checks",
        ["Jwt:Expiry"] = "1",
        ["Jwt:ExpireRefreshToken"] = "2",
        ["GrpcClients:FileService"] = "http://127.0.0.1:1"
    }).Build();

    await using var app = await StartTestAppAsync(runtimeConfig, http2: false);

    // Generate SQL without opening a connection or touching any database.
    using (var scope = app.Services.CreateScope())
    {
        Console.WriteLine("Resolving SystemContext...");
        var db = scope.ServiceProvider.GetRequiredService<SystemContext>();
        Console.WriteLine("Generating PostgreSQL schema...");
        var script = db.Database.GenerateCreateScript();
        Assert(script.Contains("timestamp without time zone"), "legacy timestamp mapping preserved");
        Assert(db.Users.Where(u => !u.IsDeleted).ToQueryString().Contains("is_deleted"),
            "user query translates with PostgreSQL provider");
        Console.WriteLine("Resolving AuthService...");
        scope.ServiceProvider.GetRequiredService<IAuthService>();
    }

    try
    {
        using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        using var response = await client.GetAsync("/api/User/get-current-user");
        Assert(response.StatusCode == System.Net.HttpStatusCode.OK, "unauthorized HTTP envelope retained");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert(!body.RootElement.GetProperty("Success").GetBoolean(), "unauthorized response fails");
        Assert(body.RootElement.GetProperty("StatusCode").GetInt32() == 401, "unauthorized application code retained");
        using var swagger = await client.GetAsync("/swagger/v1/swagger.json");
        Assert(swagger.IsSuccessStatusCode, "Swagger generation succeeds");
        using var document = JsonDocument.Parse(await swagger.Content.ReadAsStringAsync());
        Assert(document.RootElement.GetProperty("paths").TryGetProperty("/api/User/get-current-user", out _),
            "Swagger contains SystemService routes");

        var wrongSigJwt = CreateTestJwt(Guid.NewGuid(), "test_user", Guid.NewGuid(), new string('y', 64));
        var expiredJwt = CreateTestJwt(Guid.NewGuid(), "test_user", Guid.NewGuid(), new string('x', 64),
            expires: DateTime.UtcNow.AddMinutes(-5), notBefore: DateTime.UtcNow.AddMinutes(-10));

        async Task AssertComboboxDeniedAsync(string? token, string caseName)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, "/api/User/get-all-combobox");
            if (token != null)
            {
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            }
            using var resp = await client.SendAsync(req);
            Assert(resp.StatusCode == System.Net.HttpStatusCode.OK, $"{caseName}: HTTP envelope");
            using var respBody = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = respBody.RootElement;
            Assert(!root.GetProperty("Success").GetBoolean(), $"{caseName}: request denied");
            Assert(root.GetProperty("StatusCode").GetInt32() == 401, $"{caseName}: application 401");
            Assert(!root.TryGetProperty("Data", out var data) || data.ValueKind == JsonValueKind.Null, $"{caseName}: no directory disclosed");
        }

        await AssertComboboxDeniedAsync(null, "combobox_anonymous_denied");
        await AssertComboboxDeniedAsync("invalid-token", "combobox_invalid_token_denied");
        await AssertComboboxDeniedAsync(wrongSigJwt, "combobox_wrong_signature_denied");
        await AssertComboboxDeniedAsync(expiredJwt, "combobox_expired_token_denied");
    }
    finally
    {
        await app.StopAsync();
    }

    Console.WriteLine("All runtime checks passed (no database connection).");
}

async Task ExpectBusinessExceptionAsync(Func<Task> action, string expectedMessage)
{
    try
    {
        await action();
    }
    catch (BusinessException ex)
    {
        if (ex.Message != expectedMessage)
        {
            throw new InvalidOperationException($"Expected BusinessException message '{expectedMessage}', but got '{ex.Message}'");
        }
        return;
    }
    catch (Exception ex)
    {
        throw new InvalidOperationException($"Expected BusinessException, but got {ex.GetType().Name}: {ex.Message}");
    }

    throw new InvalidOperationException($"Expected BusinessException with message '{expectedMessage}', but no exception was thrown.");
}

async Task RunAuthChecksAsync()
{
    var rawConnStr = Environment.GetEnvironmentVariable("SYSTEMSERVICE_CLEANUP_TEST_CONNECTION");
    if (string.IsNullOrWhiteSpace(rawConnStr))
    {
        rawConnStr = Environment.GetEnvironmentVariable("SYSTEMSERVICE_CLEANUP_TEST_CONNECTION", EnvironmentVariableTarget.User);
    }

    if (string.IsNullOrWhiteSpace(rawConnStr))
    {
        Console.Error.WriteLine("Prerequisite missing: SYSTEMSERVICE_CLEANUP_TEST_CONNECTION environment variable is not set.");
        Environment.ExitCode = 1;
        return;
    }

    NpgsqlConnectionStringBuilder connBuilder;
    try
    {
        connBuilder = new NpgsqlConnectionStringBuilder(rawConnStr);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Invalid connection string format: {ex.Message}");
        Environment.ExitCode = 1;
        return;
    }

    var host = connBuilder.Host?.Trim().ToLowerInvariant();
    if (host != "localhost" && host != "127.0.0.1" && host != "::1")
    {
        Console.Error.WriteLine($"Security error: Host must be localhost, 127.0.0.1, or ::1. Got '{host}'.");
        Environment.ExitCode = 1;
        return;
    }

    if (connBuilder.Database != "blocks_systemservice_cleanup_test")
    {
        Console.Error.WriteLine($"Security error: Database must be 'blocks_systemservice_cleanup_test'. Got '{connBuilder.Database}'.");
        Environment.ExitCode = 1;
        return;
    }

    var schemaGuid = Guid.NewGuid().ToString("N");
    var schemaName = $"cleanup_{schemaGuid}";
    var schemaCreated = false;

    // Use connection without search path for schema management
    var baseConnStr = connBuilder.ConnectionString;

    try
    {
        // 1. Create isolated schema
        using (var adminConn = new NpgsqlConnection(baseConnStr))
        {
            await adminConn.OpenAsync();
            using var cmd = adminConn.CreateCommand();
            cmd.CommandText = $"CREATE SCHEMA \"{schemaName}\";";
            await cmd.ExecuteNonQueryAsync();
            schemaCreated = true;
        }

        // 2. Configure builder with SearchPath pointing to isolated schema
        connBuilder.SearchPath = $"{schemaName},public";
        var scopedConnStr = connBuilder.ConnectionString;

        // 3. Build DI container
        var services = new ServiceCollection();

        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "systemservice-cleanup-checks-super-secret-key-at-least-64-characters-long!!",
            ["Jwt:Issuer"] = "systemservice-cleanup-checks",
            ["Jwt:Audience"] = "systemservice-cleanup-checks",
            ["Jwt:Expiry"] = "1",
            ["Jwt:ExpireRefreshToken"] = "2"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddAutoMapper(cfg =>
        {
            cfg.AddProfile<AuthProfile>();
            cfg.AddProfile<UserProfile>();
        });
        services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
        services.AddSingleton<ILoggerFactory>(NullLoggerFactory.Instance);
        services.AddDbContext<SystemContext>(options =>
        {
            options.UseNpgsql(scopedConnStr);
        });
        services.AddTransient<IAuthService, AuthService>();

        var serviceProvider = services.BuildServiceProvider();

        // 4. Create tables via SystemContext.Database.GenerateCreateScript()
        using (var setupScope = serviceProvider.CreateScope())
        {
            var db = setupScope.ServiceProvider.GetRequiredService<SystemContext>();
            var script = db.Database.GenerateCreateScript();
            await db.Database.ExecuteSqlRawAsync(script);
        }

        // 5. Seed fixtures
        var extRoleId = Guid.Parse("551d1351-008e-4910-a39c-1fcdde409fdf");
        var normalRoleId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var extRole = new Role
        {
            Id = extRoleId,
            Name = "External Reviewer",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = true,
            IsDeleted = false
        };

        var normalRole = new Role
        {
            Id = normalRoleId,
            Name = "Admin",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = true,
            IsDeleted = false
        };

        var salt = Encrypt_DecryptHelper.GenerateSalt();
        var hashedPassword = Encrypt_DecryptHelper.EncodePassword("cleanup-test-only", salt);

        var normalActiveUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "normal_active",
            Fullname = "Normal Active User",
            Password = hashedPassword,
            PasswordSalt = salt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = true,
            IsDeleted = false,
            RoleId = normalRoleId,
            Email = "normal_active@test.local"
        };

        var normalInactiveUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "normal_inactive",
            Fullname = "Normal Inactive User",
            Password = hashedPassword,
            PasswordSalt = salt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = false,
            IsDeleted = false,
            RoleId = normalRoleId,
            Email = "normal_inactive@test.local"
        };

        var normalDeletedUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "normal_deleted",
            Fullname = "Normal Deleted User",
            Password = hashedPassword,
            PasswordSalt = salt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = true,
            IsDeleted = true,
            RoleId = normalRoleId,
            Email = "normal_deleted@test.local"
        };

        var extActiveUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "ext_active",
            Fullname = "External Active User",
            Password = hashedPassword,
            PasswordSalt = salt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = true,
            IsDeleted = false,
            RoleId = extRoleId,
            Email = "ext_active@test.local"
        };

        var extInactiveUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "ext_inactive",
            Fullname = "External Inactive User",
            Password = hashedPassword,
            PasswordSalt = salt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed",
            IsActived = false,
            IsDeleted = false,
            RoleId = extRoleId,
            Email = "ext_inactive@test.local"
        };

        var extActiveValidToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = extActiveUser.Id,
            Token = "ext-active-valid-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var extInactiveValidToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = extInactiveUser.Id,
            Token = "ext-inactive-valid-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalValidToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalActiveUser.Id,
            Token = "normal-valid-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalExpiredToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalActiveUser.Id,
            Token = "normal-expired-token",
            ExpiresAt = DateTime.UtcNow.AddDays(-1),
            CreatedAt = DateTime.UtcNow.AddDays(-2),
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalRevokedToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalActiveUser.Id,
            Token = "normal-revoked-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            CreatedByIp = "127.0.0.1",
            RevokedAt = DateTime.UtcNow,
            RevokedByIp = "127.0.0.1",
            ReasonRevoked = "Testing",
            ReplacedByToken = null
        };

        var normalInactiveValidToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalInactiveUser.Id,
            Token = "normal-inactive-valid-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalDeletedValidToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalDeletedUser.Id,
            Token = "normal-deleted-valid-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalInactiveRevokedToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalInactiveUser.Id,
            Token = "normal-inactive-revoked-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            CreatedByIp = "127.0.0.1",
            RevokedAt = DateTime.UtcNow,
            RevokedByIp = "127.0.0.1",
            ReasonRevoked = "Testing",
            ReplacedByToken = "normal-inactive-child-token"
        };

        var normalInactiveChildActiveToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalInactiveUser.Id,
            Token = "normal-inactive-child-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        var normalDeletedRevokedToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalDeletedUser.Id,
            Token = "normal-deleted-revoked-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            CreatedByIp = "127.0.0.1",
            RevokedAt = DateTime.UtcNow,
            RevokedByIp = "127.0.0.1",
            ReasonRevoked = "Testing",
            ReplacedByToken = "normal-deleted-child-token"
        };

        var normalDeletedChildActiveToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = normalDeletedUser.Id,
            Token = "normal-deleted-child-token",
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = "127.0.0.1",
            RevokedAt = null,
            ReplacedByToken = null
        };

        using (var seedScope = serviceProvider.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<SystemContext>();
            db.Roles.AddRange(extRole, normalRole);
            db.Users.AddRange(normalActiveUser, normalInactiveUser, normalDeletedUser, extActiveUser, extInactiveUser);
            db.RefreshTokens.AddRange(
                extActiveValidToken,
                extInactiveValidToken,
                normalValidToken,
                normalExpiredToken,
                normalRevokedToken,
                normalInactiveValidToken,
                normalDeletedValidToken,
                normalInactiveRevokedToken,
                normalInactiveChildActiveToken,
                normalDeletedRevokedToken,
                normalDeletedChildActiveToken);
            await db.SaveChangesAsync();
        }

        // 6. Run auth checks and the production audit registration check.
        int passed = 0;
        int failed = 0;

        async Task RunCaseAsync(string name, Func<IServiceProvider, Task> action)
        {
            using var scope = serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SystemContext>();
            using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                await action(scope.ServiceProvider);
                await tx.RollbackAsync();
                Console.WriteLine($"[PASS] {name}");
                passed++;
            }
            catch (Exception ex)
            {
                try { await tx.RollbackAsync(); } catch { }
                Console.WriteLine($"[FAIL] {name}: {ex.Message}");
                failed++;
            }
        }

        async Task RunRequestCaseAsync(string name, Func<Task> action)
        {
            try
            {
                await action();
                Console.WriteLine($"[PASS] {name}");
                passed++;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FAIL] {name}: {ex.Message}");
                failed++;
            }
        }

        // Case 1: di_without_business_client
        await RunCaseAsync("di_without_business_client", sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            Assert(auth is AuthService, "auth service resolved to AuthService");
            Assert(!services.Any(s =>
                s.ServiceType.FullName?.Contains("Business") == true ||
                s.ImplementationType?.FullName?.Contains("Business") == true),
                "no business client registered in DI");
            return Task.CompletedTask;
        });

        // Case 2: login_external_active_denied
        await RunCaseAsync("login_external_active_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var externalLogin = new LoginRequest { Username = "ext_active", Password = "cleanup-test-only" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(externalLogin, "127.0.0.1"),
                "Tài khoản hoặc mật khẩu không đúng");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 3: login_external_inactive_denied
        await RunCaseAsync("login_external_inactive_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var externalLogin = new LoginRequest { Username = "ext_inactive", Password = "cleanup-test-only" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(externalLogin, "127.0.0.1"),
                "Tài khoản hoặc mật khẩu không đúng");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 4: login_external_wrong_password_denied
        await RunCaseAsync("login_external_wrong_password_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var externalLogin = new LoginRequest { Username = "ext_active", Password = "wrong-password" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(externalLogin, "127.0.0.1"),
                "Tài khoản hoặc mật khẩu không đúng");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 5: login_normal_succeeds
        await RunCaseAsync("login_normal_succeeds", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var normalLogin = new LoginRequest { Username = "normal_active", Password = "cleanup-test-only" };

            var res = await auth.LoginAsync(normalLogin, "127.0.0.1");
            Assert(res.Id == normalActiveUser.Id, "response Id matches");
            Assert(res.RoleId == normalRoleId, "response RoleId matches");
            Assert(!string.IsNullOrEmpty(res.AccessToken), "access token not empty");
            Assert(!string.IsNullOrEmpty(res.RefreshToken), "refresh token not empty");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount + 1, "db token count increased by 1");

            var tokenInDb = await db.RefreshTokens.AsNoTracking().SingleOrDefaultAsync(t => t.Token == res.RefreshToken);
            Assert(tokenInDb != null && tokenInDb.UserId == normalActiveUser.Id, "token in db belongs to user");

            var jwtHandler = new JwtSecurityTokenHandler();
            var jwtToken = jwtHandler.ReadJwtToken(res.AccessToken);
            Assert(jwtToken.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Name).Value == normalActiveUser.Id.ToString(), "jwt name claim matches Id");
            Assert(jwtToken.Claims.Single(c => c.Type == "role").Value == normalRoleId.ToString(), "jwt role claim matches RoleId");
        });

        // Case 6: login_wrong_password_denied
        await RunCaseAsync("login_wrong_password_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var login = new LoginRequest { Username = "normal_active", Password = "wrong-password" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(login, "127.0.0.1"),
                "Tài khoản hoặc mật khẩu không đúng");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 7: login_missing_user_denied
        await RunCaseAsync("login_missing_user_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var login = new LoginRequest { Username = "missing_user", Password = "cleanup-test-only" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(login, "127.0.0.1"),
                "Tài khoản không tồn tại");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 8: login_deleted_user_denied
        await RunCaseAsync("login_deleted_user_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var login = new LoginRequest { Username = "normal_deleted", Password = "cleanup-test-only" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(login, "127.0.0.1"),
                "Tài khoản không tồn tại");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 9: login_inactive_user_denied
        await RunCaseAsync("login_inactive_user_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var login = new LoginRequest { Username = "normal_inactive", Password = "cleanup-test-only" };

            await ExpectBusinessExceptionAsync(
                () => auth.LoginAsync(login, "127.0.0.1"),
                "Tài khoản đã bị vô hiệu");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
        });

        // Case 10: refresh_external_active_denied
        await RunCaseAsync("refresh_external_active_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var externalRefresh = new RefreshTokenRequest { RefreshToken = "ext-active-valid-token" };

            await ExpectBusinessExceptionAsync(
                () => Task.FromResult(auth.RefreshToken(externalRefresh, "127.0.0.1")),
                "Token không hợp lệ");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
            var stored = await db.RefreshTokens.AsNoTracking()
                .SingleAsync(t => t.Token == externalRefresh.RefreshToken);
            Assert(stored.RevokedAt == null && stored.ReplacedByToken == null, "old token unchanged");
        });

        // Case 11: refresh_external_inactive_denied
        await RunCaseAsync("refresh_external_inactive_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();
            var externalRefresh = new RefreshTokenRequest { RefreshToken = "ext-inactive-valid-token" };

            await ExpectBusinessExceptionAsync(
                () => Task.FromResult(auth.RefreshToken(externalRefresh, "127.0.0.1")),
                "Token không hợp lệ");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
            var stored = await db.RefreshTokens.AsNoTracking()
                .SingleAsync(t => t.Token == externalRefresh.RefreshToken);
            Assert(stored.RevokedAt == null && stored.ReplacedByToken == null, "old token unchanged");
        });

        // Case 12: refresh_missing_token_denied
        await RunCaseAsync("refresh_missing_token_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();

            await ExpectBusinessExceptionAsync(
                () => Task.FromResult(auth.RefreshToken(new RefreshTokenRequest { RefreshToken = "missing-token" }, "127.0.0.1")),
                "Token không hợp lệ");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
        });

        // Case 13: refresh_expired_token_denied
        await RunCaseAsync("refresh_expired_token_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();

            await ExpectBusinessExceptionAsync(
                () => Task.FromResult(auth.RefreshToken(new RefreshTokenRequest { RefreshToken = "normal-expired-token" }, "127.0.0.1")),
                "Token không hợp lệ");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
            var stored = await db.RefreshTokens.AsNoTracking()
                .SingleAsync(t => t.Token == "normal-expired-token");
            Assert(stored.RevokedAt == null && stored.ReplacedByToken == null, "expired token unchanged");
        });

        // Case 14: refresh_revoked_token_denied
        await RunCaseAsync("refresh_revoked_token_denied", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();

            await ExpectBusinessExceptionAsync(
                () => Task.FromResult(auth.RefreshToken(new RefreshTokenRequest { RefreshToken = "normal-revoked-token" }, "127.0.0.1")),
                "Token không hợp lệ");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
            var stored = await db.RefreshTokens.AsNoTracking()
                .SingleAsync(t => t.Token == "normal-revoked-token");
            Assert(stored.RevokedAt != null && stored.ReplacedByToken == null, "revoked token unchanged");
        });

        // Case 15: refresh_normal_rotates
        await RunCaseAsync("refresh_normal_rotates", async sp =>
        {
            var auth = sp.GetRequiredService<IAuthService>();
            var db = sp.GetRequiredService<SystemContext>();
            var beforeCount = await db.RefreshTokens.CountAsync();

            var res = auth.RefreshToken(new RefreshTokenRequest { RefreshToken = "normal-valid-token" }, "127.0.0.1");
            Assert(!string.IsNullOrEmpty(res.AccessToken), "access token not empty");
            Assert(!string.IsNullOrEmpty(res.RefreshToken), "refresh token not empty");
            Assert(res.RefreshToken != "normal-valid-token", "token rotated");
            Assert(await db.RefreshTokens.CountAsync() == beforeCount + 1, "db token count increased by 1");

            var oldToken = await db.RefreshTokens.AsNoTracking().SingleAsync(t => t.Token == "normal-valid-token");
            Assert(oldToken.RevokedAt != null, "old token revoked");
            Assert(oldToken.ReplacedByToken == res.RefreshToken, "old token replaced by new token");

            var newToken = await db.RefreshTokens.AsNoTracking().SingleAsync(t => t.Token == res.RefreshToken);
            Assert(newToken.UserId == normalActiveUser.Id, "new token belongs to user");
        });

        async Task RunDeniedTokenCaseAsync(string name, string tokenValue)
        {
            await RunCaseAsync(name, async sp =>
            {
                var auth = sp.GetRequiredService<IAuthService>();
                var db = sp.GetRequiredService<SystemContext>();
                var beforeCount = await db.RefreshTokens.CountAsync();
                var beforeRows = (await db.RefreshTokens.AsNoTracking().OrderBy(t => t.Id)
                    .Select(t => new { t.Id, t.UserId, t.Token, t.RevokedAt, t.RevokedByIp, t.ReasonRevoked, t.ReplacedByToken })
                    .ToListAsync())
                    .Select(t => (t.Id, t.UserId, t.Token, t.RevokedAt, t.RevokedByIp, t.ReasonRevoked, t.ReplacedByToken))
                    .ToList();

                var request = new RefreshTokenRequest { RefreshToken = tokenValue };

                await ExpectBusinessExceptionAsync(
                    () => Task.FromResult(auth.RefreshToken(request, "127.0.0.1")),
                    "Token không hợp lệ");

                var afterCount = await db.RefreshTokens.CountAsync();
                var afterRows = (await db.RefreshTokens.AsNoTracking().OrderBy(t => t.Id)
                    .Select(t => new { t.Id, t.UserId, t.Token, t.RevokedAt, t.RevokedByIp, t.ReasonRevoked, t.ReplacedByToken })
                    .ToListAsync())
                    .Select(t => (t.Id, t.UserId, t.Token, t.RevokedAt, t.RevokedByIp, t.ReasonRevoked, t.ReplacedByToken))
                    .ToList();

                Assert(beforeCount == afterCount, "no new token");
                Assert(beforeRows.SequenceEqual(afterRows), "tokens and descendants unchanged");
            });
        }

        await RunDeniedTokenCaseAsync("refresh_normal_inactive_denied", "normal-inactive-valid-token");
        await RunDeniedTokenCaseAsync("refresh_normal_deleted_denied", "normal-deleted-valid-token");
        await RunDeniedTokenCaseAsync("refresh_inactive_revoked_chain_unchanged", "normal-inactive-revoked-token");
        await RunDeniedTokenCaseAsync("refresh_deleted_revoked_chain_unchanged", "normal-deleted-revoked-token");

        await RunCaseAsync("production_di_persists_audit", async _ =>
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
            builder.Host.UseDefaultServiceProvider(options =>
            {
                options.ValidateScopes = true;
                options.ValidateOnBuild = true;
            });
            builder.Configuration.Sources.Clear();
            builder.Configuration.AddConfiguration(configuration);
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:System"] = scopedConnStr
            });
            builder.ExecuteConfigService();
            await using var app = builder.Build();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SystemContext>();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
            accessor.HttpContext = new DefaultHttpContext
            {
                User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
                    new[] { new System.Security.Claims.Claim("name", normalActiveUser.Id.ToString()) }, "test"))
            };
            try
            {
                var user = await db.Users.SingleAsync(u => u.Id == normalActiveUser.Id);
                user.Fullname = "Audit Test";
                await db.SaveChangesAsync();
                var audit = await db.AuditLogs.AsNoTracking().SingleAsync();
                Assert(audit.UserId == normalActiveUser.Id, "audit references authenticated user");
                Assert(audit.IsSuccess && audit.Action == "UPDATE", "audit records successful update");
                using var values = JsonDocument.Parse(audit.NewValues!);
                Assert(values.RootElement.GetProperty("User")[0].GetProperty("Fullname").GetString() == "Audit Test",
                    "audit contains updated user values");
            }
            finally
            {
                accessor.HttpContext = null;
                await transaction.RollbackAsync();
            }
        });

        await RunRequestCaseAsync("combobox_authenticated_without_user_view_succeeds", async () =>
        {
            var authAppConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:System"] = scopedConnStr,
                ["Jwt:Key"] = new string('x', 64),
                ["Jwt:Issuer"] = "systemservice-cleanup-checks",
                ["Jwt:Audience"] = "systemservice-cleanup-checks",
                ["Jwt:Expiry"] = "1",
                ["Jwt:ExpireRefreshToken"] = "2",
                ["GrpcClients:FileService"] = "http://127.0.0.1:1"
            }).Build();

            await using var app = await StartTestAppAsync(authAppConfig, http2: false);
            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
                var jwt = CreateTestJwt(normalActiveUser.Id, normalActiveUser.Username, normalRoleId, new string('x', 64));
                using var req = new HttpRequestMessage(HttpMethod.Get, "/api/User/get-all-combobox");
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", jwt);

                using var response = await client.SendAsync(req);
                Assert(response.StatusCode == System.Net.HttpStatusCode.OK, "HTTP envelope");
                using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                var root = body.RootElement;
                Assert(root.GetProperty("Success").GetBoolean(), "request succeeds");
                Assert(root.GetProperty("StatusCode").GetInt32() == 200, "application 200");
                var data = root.GetProperty("Data");
                Assert(data.ValueKind == JsonValueKind.Array, "Data is array");

                var items = data.EnumerateArray().ToList();
                Assert(items.Count == 2, "only active non-deleted users");
                Assert(items[0].GetProperty("Value").GetString() == extActiveUser.Id.ToString(), "first user id");
                Assert(items[0].GetProperty("Text").GetString() == $"[{extActiveUser.Username}] - {extActiveUser.Fullname}", "first user text");
                Assert(items[1].GetProperty("Value").GetString() == normalActiveUser.Id.ToString(), "second user id");
                Assert(items[1].GetProperty("Text").GetString() == $"[{normalActiveUser.Username}] - {normalActiveUser.Fullname}", "second user text");
            }
            finally
            {
                await app.StopAsync();
            }
        });

        Console.WriteLine($"\nSummary: {passed} passed, {failed} failed (total {passed + failed})");
        Environment.ExitCode = failed > 0 ? 1 : 0;
    }
    finally
    {
        if (schemaCreated)
        {
            var cleanupBuilder = new NpgsqlConnectionStringBuilder(baseConnStr);
            var hostCheck = cleanupBuilder.Host?.Trim().ToLowerInvariant();
            if ((hostCheck == "localhost" || hostCheck == "127.0.0.1" || hostCheck == "::1")
                && cleanupBuilder.Database == "blocks_systemservice_cleanup_test"
                && schemaName.StartsWith("cleanup_")
                && schemaName.Length == 8 + 32)
            {
                using var cleanupConn = new NpgsqlConnection(cleanupBuilder.ConnectionString);
                await cleanupConn.OpenAsync();
                using var dropCmd = cleanupConn.CreateCommand();
                dropCmd.CommandText = $"DROP SCHEMA IF EXISTS \"{schemaName}\" CASCADE;";
                await dropCmd.ExecuteNonQueryAsync();
                Console.WriteLine($"Cleaned up test schema: {schemaName}");
            }
            else
            {
                throw new InvalidOperationException("Safety check failed before dropping schema!");
            }
        }
    }
}

void RunContractChecks()
{
    Console.WriteLine("Running contract checks...");

    // --- 1. SystemProto Service Identity and Methods ---
    var systemDescriptor = SystemReflection.Descriptor;
    var service = systemDescriptor.Services.Single();
    Assert(service.FullName == "system.SystemProto", "service identity preserved");

    var actualMethods = service.Methods.Select(m => m.Name).OrderBy(x => x).ToArray();
    var expectedMethods = new[] {
        "CheckPermission", "GetUsersByIds", "GetUsersByUsernames",
        "SetUsersActived", "GetUsersByIdsPaged", "UpdateUserProfile",
        "GetActiveUsersExceptRole"
    }.OrderBy(x => x).ToArray();

    Assert(actualMethods.SequenceEqual(expectedMethods), "only seven retained RPCs");

    var removedMessages = new[] {
        "CreateExternalUserRequest", "CreateExternalUserResponse",
        "DeleteExternalUserRequest", "DeleteExternalUserResponse"
    };
    Assert(!systemDescriptor.MessageTypes.Any(m => removedMessages.Contains(m.Name)), "specialized messages removed");

    // --- 2. RPC Signatures Snapshot for 7 Retained RPCs ---
    var expectedMethodSnapshots = new Dictionary<string, (string FullName, string InputType, string OutputType, bool ClientStreaming, bool ServerStreaming)>
    {
        ["CheckPermission"] = ("system.SystemProto.CheckPermission", "system.CheckPermissionRequest", "system.CheckActionResponse", false, false),
        ["GetUsersByIds"] = ("system.SystemProto.GetUsersByIds", "system.GetUsersByIdsRequest", "system.GetUsersByIdsResponse", false, false),
        ["GetUsersByUsernames"] = ("system.SystemProto.GetUsersByUsernames", "system.GetUsersByUsernamesRequest", "system.GetUsersByUsernamesResponse", false, false),
        ["SetUsersActived"] = ("system.SystemProto.SetUsersActived", "system.SetUsersActivedRequest", "system.SetUsersActivedResponse", false, false),
        ["GetUsersByIdsPaged"] = ("system.SystemProto.GetUsersByIdsPaged", "system.GetUsersByIdsPagedRequest", "system.GetUsersByIdsPagedResponse", false, false),
        ["UpdateUserProfile"] = ("system.SystemProto.UpdateUserProfile", "system.UpdateUserProfileRequest", "system.UpdateUserProfileResponse", false, false),
        ["GetActiveUsersExceptRole"] = ("system.SystemProto.GetActiveUsersExceptRole", "system.GetActiveUsersExceptRoleRequest", "system.GetActiveUsersExceptRoleResponse", false, false)
    };

    foreach (var method in service.Methods)
    {
        Assert(expectedMethodSnapshots.TryGetValue(method.Name, out var snap), $"unexpected method {method.Name}");
        Assert(method.FullName == snap.FullName, $"method {method.Name} FullName matches");
        Assert(method.InputType.FullName == snap.InputType, $"method {method.Name} InputType matches");
        Assert(method.OutputType.FullName == snap.OutputType, $"method {method.Name} OutputType matches");
        Assert(method.IsClientStreaming == snap.ClientStreaming, $"method {method.Name} ClientStreaming matches");
        Assert(method.IsServerStreaming == snap.ServerStreaming, $"method {method.Name} ServerStreaming matches");
    }

    // --- 3. Retained Message Types and Fields in system.proto ---
    var expectedSystemMessages = new Dictionary<string, (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]>
    {
        ["CheckPermissionRequest"] = new[]
        {
            ("user_id", 1, FieldType.String, false, (string?)null),
            ("controller", 2, FieldType.String, false, (string?)null),
            ("action", 3, FieldType.Int32, false, (string?)null)
        },
        ["CheckActionResponse"] = new[]
        {
            ("success", 1, FieldType.Bool, false, (string?)null)
        },
        ["GetUsersByIdsRequest"] = new[]
        {
            ("user_ids", 1, FieldType.String, true, (string?)null)
        },
        ["UserInfo"] = new[]
        {
            ("id", 1, FieldType.String, false, (string?)null),
            ("fullname", 2, FieldType.String, false, (string?)null),
            ("avatar", 3, FieldType.String, false, (string?)null),
            ("username", 4, FieldType.String, false, (string?)null),
            ("is_actived", 5, FieldType.Bool, false, (string?)null),
            ("email", 6, FieldType.String, false, (string?)null)
        },
        ["GetUsersByIdsResponse"] = new (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]
        {
            ("users", 1, FieldType.Message, true, "system.UserInfo")
        },
        ["GetUsersByUsernamesRequest"] = new[]
        {
            ("usernames", 1, FieldType.String, true, (string?)null)
        },
        ["GetUsersByUsernamesResponse"] = new (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]
        {
            ("users", 1, FieldType.Message, true, "system.UserInfo")
        },
        ["SetUsersActivedRequest"] = new[]
        {
            ("user_ids", 1, FieldType.String, true, (string?)null),
            ("is_actived", 2, FieldType.Bool, false, (string?)null)
        },
        ["SetUsersActivedResponse"] = new[]
        {
            ("success", 1, FieldType.Bool, false, (string?)null)
        },
        ["GetUsersByIdsPagedRequest"] = new[]
        {
            ("user_ids", 1, FieldType.String, true, (string?)null),
            ("text_search", 2, FieldType.String, false, (string?)null),
            ("page_index", 3, FieldType.Int32, false, (string?)null),
            ("page_size", 4, FieldType.Int32, false, (string?)null)
        },
        ["GetUsersByIdsPagedResponse"] = new (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]
        {
            ("users", 1, FieldType.Message, true, "system.UserInfo"),
            ("page_index", 2, FieldType.Int32, false, (string?)null),
            ("page_size", 3, FieldType.Int32, false, (string?)null),
            ("total_row", 4, FieldType.Int32, false, (string?)null)
        },
        ["UpdateUserProfileRequest"] = new[]
        {
            ("user_id", 1, FieldType.String, false, (string?)null),
            ("fullname", 2, FieldType.String, false, (string?)null),
            ("username", 3, FieldType.String, false, (string?)null),
            ("email", 4, FieldType.String, false, (string?)null),
            ("password", 5, FieldType.String, false, (string?)null)
        },
        ["UpdateUserProfileResponse"] = new (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]
        {
            ("success", 1, FieldType.Bool, false, (string?)null),
            ("message", 2, FieldType.String, false, (string?)null),
            ("user", 3, FieldType.Message, false, "system.UserInfo")
        },
        ["GetActiveUsersExceptRoleRequest"] = new[]
        {
            ("excluded_role_id", 1, FieldType.String, false, (string?)null)
        },
        ["GetActiveUsersExceptRoleResponse"] = new (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]
        {
            ("users", 1, FieldType.Message, true, "system.UserInfo")
        }
    };

    var actualMessageNames = systemDescriptor.MessageTypes.Select(m => m.Name).OrderBy(x => x).ToArray();
    var expectedMessageNames = expectedSystemMessages.Keys.OrderBy(x => x).ToArray();
    Assert(actualMessageNames.SequenceEqual(expectedMessageNames), "system message names match retained snapshot exactly");

    foreach (var msgDesc in systemDescriptor.MessageTypes)
    {
        Assert(expectedSystemMessages.TryGetValue(msgDesc.Name, out var expectedFields), $"unexpected message type {msgDesc.Name}");
        var actualFields = msgDesc.Fields.InDeclarationOrder().Select(f =>
            (Name: f.Name, Number: f.FieldNumber, Type: f.FieldType, Repeated: f.IsRepeated,
             MessageType: f.FieldType == FieldType.Message || f.FieldType == FieldType.Group ? f.MessageType.FullName : null)
        ).ToArray();

        Assert(actualFields.Length == expectedFields!.Length, $"field count match for {msgDesc.Name}");
        for (int i = 0; i < expectedFields.Length; i++)
        {
            var exp = expectedFields[i];
            var act = actualFields[i];
            Assert(act.Name == exp.Name, $"field {i} Name match for {msgDesc.Name}: expected {exp.Name}, got {act.Name}");
            Assert(act.Number == exp.Number, $"field {i} Number match for {msgDesc.Name}");
            Assert(act.Type == exp.Type, $"field {i} Type match for {msgDesc.Name}");
            Assert(act.Repeated == exp.Repeated, $"field {i} Repeated match for {msgDesc.Name}");
            Assert(act.MessageType == exp.MessageType, $"field {i} MessageType match for {msgDesc.Name}");
        }
    }

    // --- 4. AuditProto Snapshot ---
    var auditDescriptor = AuditReflection.Descriptor;
    var auditService = auditDescriptor.Services.Single();
    Assert(auditService.FullName == "audit.AuditProto", "audit service identity preserved");
    var auditMethods = auditService.Methods.Select(m => m.Name).ToArray();
    Assert(auditMethods.SequenceEqual(new[] { "WriteAuditLog" }), "audit has exactly WriteAuditLog");

    var writeAuditMethod = auditService.Methods.Single();
    Assert(writeAuditMethod.FullName == "audit.AuditProto.WriteAuditLog", "audit method full name");
    Assert(writeAuditMethod.InputType.FullName == "audit.WriteAuditLogRequest", "audit method input type");
    Assert(writeAuditMethod.OutputType.FullName == "audit.WriteAuditLogReply", "audit method output type");
    Assert(!writeAuditMethod.IsClientStreaming, "audit method not client streaming");
    Assert(!writeAuditMethod.IsServerStreaming, "audit method not server streaming");

    var expectedAuditMessages = new Dictionary<string, (string Name, int Number, FieldType Type, bool Repeated, string? MessageType)[]>
    {
        ["WriteAuditLogRequest"] = new[]
        {
            ("user_id", 1, FieldType.String, false, (string?)null),
            ("user_name", 2, FieldType.String, false, (string?)null),
            ("action", 3, FieldType.String, false, (string?)null),
            ("entity_name", 4, FieldType.String, false, (string?)null),
            ("entity_id", 5, FieldType.String, false, (string?)null),
            ("old_values", 6, FieldType.String, false, (string?)null),
            ("new_values", 7, FieldType.String, false, (string?)null),
            ("ip_address", 8, FieldType.String, false, (string?)null),
            ("service_name", 9, FieldType.String, false, (string?)null),
            ("is_success", 10, FieldType.Bool, false, (string?)null),
            ("error_message", 11, FieldType.String, false, (string?)null)
        },
        ["WriteAuditLogReply"] = new[]
        {
            ("success", 1, FieldType.Bool, false, (string?)null),
            ("message", 2, FieldType.String, false, (string?)null)
        }
    };

    var actualAuditMsgNames = auditDescriptor.MessageTypes.Select(m => m.Name).OrderBy(x => x).ToArray();
    var expectedAuditMsgNames = expectedAuditMessages.Keys.OrderBy(x => x).ToArray();
    Assert(actualAuditMsgNames.SequenceEqual(expectedAuditMsgNames), "audit message types match snapshot");

    foreach (var msgDesc in auditDescriptor.MessageTypes)
    {
        Assert(expectedAuditMessages.TryGetValue(msgDesc.Name, out var expectedFields), $"unexpected audit message {msgDesc.Name}");
        var actualFields = msgDesc.Fields.InDeclarationOrder().Select(f =>
            (Name: f.Name, Number: f.FieldNumber, Type: f.FieldType, Repeated: f.IsRepeated,
             MessageType: f.FieldType == FieldType.Message || f.FieldType == FieldType.Group ? f.MessageType.FullName : null)
        ).ToArray();

        Assert(actualFields.Length == expectedFields!.Length, $"audit field count match for {msgDesc.Name}");
        for (int i = 0; i < expectedFields.Length; i++)
        {
            var exp = expectedFields[i];
            var act = actualFields[i];
            Assert(act.Name == exp.Name, $"audit field {i} Name match for {msgDesc.Name}");
            Assert(act.Number == exp.Number, $"audit field {i} Number match for {msgDesc.Name}");
            Assert(act.Type == exp.Type, $"audit field {i} Type match for {msgDesc.Name}");
            Assert(act.Repeated == exp.Repeated, $"audit field {i} Repeated match for {msgDesc.Name}");
            Assert(act.MessageType == exp.MessageType, $"audit field {i} MessageType match for {msgDesc.Name}");
        }
    }

    // --- 5. SystemGrpcService Reflection ---
    var serviceType = typeof(SystemGrpcService);

    // Declared public instance methods (overrides)
    var declaredPublicMethods = serviceType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
        .Select(m => m.Name)
        .OrderBy(x => x)
        .ToArray();
    Assert(declaredPublicMethods.SequenceEqual(expectedMethods), "SystemGrpcService has exactly seven declared override methods");

    // Constructor: SystemGrpcService(SystemContext context, IUserService userService)
    var ctors = serviceType.GetConstructors(BindingFlags.Public | BindingFlags.Instance);
    Assert(ctors.Length == 1, "SystemGrpcService has exactly one public constructor");
    var ctorParams = ctors[0].GetParameters().Select(p => p.ParameterType).ToArray();
    var expectedParams = new[] { typeof(SystemContext), typeof(IUserService) };
    Assert(ctorParams.SequenceEqual(expectedParams), "constructor parameter types match (SystemContext context, IUserService userService)");

    // No ISystemReferenceGuard field
    var instanceFields = serviceType.GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
    Assert(!instanceFields.Any(f => f.FieldType == typeof(ISystemReferenceGuard) || f.Name.Contains("referenceGuard", StringComparison.OrdinalIgnoreCase)),
        "SystemGrpcService has no reference guard field");

    Console.WriteLine("All contract checks passed!");
}
