using System.IdentityModel.Tokens.Jwt;
using AutoMapper;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Services.CoreFeature.Auth;
using Blocks.SystemService.Services.CoreFeature.User;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: dotnet run --project test/SystemService.CleanupChecks -- <mode>");
    Console.Error.WriteLine("Supported modes: auth, contract");
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
else if (mode == "contract")
{
    Console.Error.WriteLine("Contract mode not yet implemented (Task 3).");
    return 1;
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

        using (var seedScope = serviceProvider.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<SystemContext>();
            db.Roles.AddRange(extRole, normalRole);
            db.Users.AddRange(normalActiveUser, normalInactiveUser, normalDeletedUser, extActiveUser, extInactiveUser);
            db.RefreshTokens.AddRange(extActiveValidToken, extInactiveValidToken, normalValidToken, normalExpiredToken, normalRevokedToken);
            await db.SaveChangesAsync();
        }

        // 6. Run 15 test cases
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
