using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AutoMapper;
using Blocks.CatalogService.Configs;
using Blocks.CatalogService.Controllers;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Entities;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.CatalogService.Infrastructure.Filters;
using Blocks.CatalogService.Middlewares;
using Blocks.CatalogService.Services.CoreFeature.Faculty;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: dotnet run --project test/CatalogService.CleanupChecks -- <mode>");
    Console.Error.WriteLine("Supported modes: contract, runtime");
    return 1;
}

var mode = args[0].TrimStart('-').ToLowerInvariant();

if (mode == "contract")
{
    try
    {
        RunContractChecks();
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"contract check failed: {ex.Message}");
        return 1;
    }
}
else if (mode == "runtime")
{
    try
    {
        await RunRuntimeChecksAsync();
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"runtime check failed: {ex.Message}");
        return 1;
    }
}
else
{
    Console.Error.WriteLine($"Unknown mode: {args[0]}");
    return 1;
}

static void Require(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException($"Assertion failed: {message}");
    }
}

static void RunContractChecks()
{
    var options = new DbContextOptionsBuilder<CatalogContext>()
        .UseMySql("Server=localhost;Database=test;Uid=test;Pwd=test;", new MySqlServerVersion(new Version(8, 0, 0)))
        .Options;

    using var db = new CatalogContext(options);

    Require(db.Model.GetEntityTypes().Count() == 1, "Only Faculty is mapped");

    var entity = db.Model.FindEntityType(typeof(Faculty));
    Require(entity != null, "Faculty entity type found");
    Require(entity!.GetTableName() == "faculty", "Lowercase faculty table retained");

    var createdAtProp = entity.FindProperty(nameof(Faculty.CreatedAt));
    Require(createdAtProp != null, "CreatedAt property exists");
    Require(!createdAtProp!.IsNullable, "CreatedAt is required");
    Require(createdAtProp.GetColumnName() == "created_at", "created_at snake_case retained");
    Require(createdAtProp.GetColumnType() == "timestamp", "CreatedAt column type is timestamp");
    Require(createdAtProp.GetDefaultValueSql() == "CURRENT_TIMESTAMP", "CreatedAt default is CURRENT_TIMESTAMP");

    var idProp = entity.FindProperty(nameof(Faculty.Id));
    Require(idProp != null, "Id property exists");
    Require(idProp!.GetColumnName() == "id", "id snake_case retained");
    Require(idProp.ClrType == typeof(Guid), "Id is Guid");
    var primaryKey = entity.FindPrimaryKey();
    Require(primaryKey != null && primaryKey.GetName() == "PRIMARY", "Primary key PRIMARY retained");

    var nameProp = entity.FindProperty(nameof(Faculty.Name));
    Require(nameProp != null, "Name property exists");
    Require(nameProp!.GetColumnName() == "name", "name snake_case retained");
    Require(nameProp.GetColumnType() == "text", "Name column type is text");

    var createdByProp = entity.FindProperty(nameof(Faculty.CreatedBy));
    Require(createdByProp != null, "CreatedBy property exists");
    Require(createdByProp!.GetColumnName() == "created_by", "created_by snake_case retained");
    Require(createdByProp.GetMaxLength() == 255, "CreatedBy max length is 255");

    var updatedAtProp = entity.FindProperty(nameof(Faculty.UpdatedAt));
    Require(updatedAtProp != null, "UpdatedAt property exists");
    Require(updatedAtProp!.GetColumnName() == "updated_at", "updated_at snake_case retained");
    Require(updatedAtProp.GetColumnType() == "timestamp", "UpdatedAt column type is timestamp");
    Require(updatedAtProp.GetDefaultValueSql() == "CURRENT_TIMESTAMP", "UpdatedAt default is CURRENT_TIMESTAMP");

    var updatedByProp = entity.FindProperty(nameof(Faculty.UpdatedBy));
    Require(updatedByProp != null, "UpdatedBy property exists");
    Require(updatedByProp!.GetColumnName() == "updated_by", "updated_by snake_case retained");
    Require(updatedByProp.GetMaxLength() == 255, "UpdatedBy max length is 255");

    var isActivedProp = entity.FindProperty(nameof(Faculty.IsActived));
    Require(isActivedProp != null, "IsActived property exists");
    Require(isActivedProp!.GetColumnName() == "is_actived", "is_actived snake_case retained");
    Require(isActivedProp.GetDefaultValueSql() == "'1'", "IsActived default value is '1'");

    var isDeletedProp = entity.FindProperty(nameof(Faculty.IsDeleted));
    Require(isDeletedProp != null, "IsDeleted property exists");
    Require(isDeletedProp!.GetColumnName() == "is_deleted", "is_deleted snake_case retained");

    var props = entity.GetProperties().ToList();
    Require(props.Count == 8, "Exactly 8 properties mapped on Faculty");

    var designModel = db.GetService<IDesignTimeModel>().Model;
    Require(designModel.GetCollation() == "utf8mb4_0900_ai_ci", "Collation utf8mb4_0900_ai_ci retained");
    Require(designModel.GetCharSet() == "utf8mb4", "CharSet utf8mb4 retained");

    var sql = db.Faculties.Where(x => !x.IsDeleted).ToQueryString();
    Require(sql.Contains("`faculty`") && sql.Contains("`is_deleted`"), "Scaffold SQL retained");

    Console.WriteLine("PASS contract checks");
}

static async Task RunRuntimeChecksAsync()
{
    var testJwtKey = new string('k', 64);
    const string testIssuer = "catalogservice-cleanup-checks";
    const string testAudience = "catalogservice-cleanup-checks";

    var tempContentRoot = Path.Combine(Path.GetTempPath(), "catalog-cleanup-checks-" + Guid.NewGuid());
    Directory.CreateDirectory(tempContentRoot);

    var builder = WebApplication.CreateBuilder(new WebApplicationOptions
    {
        Args = Array.Empty<string>(),
        EnvironmentName = Environments.Development,
        ContentRootPath = tempContentRoot
    });

    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Listen(IPAddress.Loopback, 0, listenOptions =>
        {
            listenOptions.Protocols = HttpProtocols.Http1;
        });
    });

    builder.Configuration.Sources.Clear();
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Jwt:Key"] = testJwtKey,
        ["Jwt:Issuer"] = testIssuer,
        ["Jwt:Audience"] = testAudience,
        ["ConnectionStrings:Catalog"] = "Server=127.0.0.1;Port=1;Database=nonexistent;Uid=x;Pwd=x;",
        ["GrpcClients:SystemService"] = "http://127.0.0.1:1"
    });

    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();

    builder.Services.AddControllers(options =>
    {
        options.Filters.AddService<AuditActionFilter>();
    }).AddApplicationPart(typeof(FacultyController).Assembly);

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();

    builder.ExecuteConfigService();
    builder.ExecuteConfigAuthentication();

    var app = builder.Build();

    app.UseMiddleware<GlobalExceptionHandler>();
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }
    app.UseCors();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();

    await app.StartAsync();

    try
    {
        var address = app.Urls.First();
        using var client = new HttpClient { BaseAddress = new Uri(address) };

        // Test 1: faculty_missing_invalid_expired_jwt_keeps_401_envelope
        // Anonymous (missing token)
        using (var resp = await client.GetAsync("/api/Faculty/get-all-combobox"))
        {
            Require(resp.StatusCode == System.Net.HttpStatusCode.OK, "Missing token HTTP 200 envelope");
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            Require(!root.GetProperty("Success").GetBoolean(), "Missing token Success is false");
            Require(root.GetProperty("StatusCode").GetInt32() == 401, "Missing token StatusCode is 401");
        }

        // Invalid signature
        var wrongKeyJwt = CreateJwt(new string('w', 64), testIssuer, testAudience);
        using (var req = new HttpRequestMessage(HttpMethod.Get, "/api/Faculty/get-all-combobox"))
        {
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", wrongKeyJwt);
            using var resp = await client.SendAsync(req);
            Require(resp.StatusCode == System.Net.HttpStatusCode.OK, "Invalid signature HTTP 200 envelope");
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            Require(!root.GetProperty("Success").GetBoolean(), "Invalid signature Success is false");
            Require(root.GetProperty("StatusCode").GetInt32() == 401, "Invalid signature StatusCode is 401");
        }

        // Expired token
        var expiredJwt = CreateJwt(testJwtKey, testIssuer, testAudience, expires: DateTime.UtcNow.AddMinutes(-5), notBefore: DateTime.UtcNow.AddMinutes(-10));
        using (var req = new HttpRequestMessage(HttpMethod.Get, "/api/Faculty/get-all-combobox"))
        {
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", expiredJwt);
            using var resp = await client.SendAsync(req);
            Require(resp.StatusCode == System.Net.HttpStatusCode.OK, "Expired token HTTP 200 envelope");
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            Require(!root.GetProperty("Success").GetBoolean(), "Expired token Success is false");
            Require(root.GetProperty("StatusCode").GetInt32() == 401, "Expired token StatusCode is 401");
        }

        // Test 2: retired_routes_are_404_with_valid_jwt
        var validJwt = CreateJwt(testJwtKey, testIssuer, testAudience);
        var retiredRoutes = new[]
        {
            "/api/FileType/get-all-combobox",
            "/api/Stakeholder/get-all-combobox",
            "/api/Standard/get-all-combobox",
            "/api/StandardSet/get-all-combobox"
        };

        foreach (var route in retiredRoutes)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, route);
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", validJwt);
            using var resp = await client.SendAsync(req);
            Require(resp.StatusCode == System.Net.HttpStatusCode.NotFound, $"Retired route {route} returns 404");
        }

        // Test 3: Swagger only contains six Faculty routes, no retired routes
        using (var swaggerResp = await client.GetAsync("/swagger/v1/swagger.json"))
        {
            Require(swaggerResp.IsSuccessStatusCode, "Swagger schema endpoint returned success");
            var swaggerJson = await swaggerResp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(swaggerJson);
            var paths = doc.RootElement.GetProperty("paths");

            var expectedFacultyRoutes = new[]
            {
                "/api/Faculty/get-list",
                "/api/Faculty/get-by-id",
                "/api/Faculty/insert",
                "/api/Faculty/update",
                "/api/Faculty/delete-list",
                "/api/Faculty/get-all-combobox"
            };

            foreach (var route in expectedFacultyRoutes)
            {
                Require(paths.TryGetProperty(route, out _), $"Swagger includes Faculty route: {route}");
            }

            foreach (var retiredPrefix in new[] { "/api/FileType", "/api/Stakeholder", "/api/Standard", "/api/StandardSet" })
            {
                foreach (var prop in paths.EnumerateObject())
                {
                    Require(!prop.Name.StartsWith(retiredPrefix, StringComparison.OrdinalIgnoreCase),
                        $"Swagger must not contain retired route: {prop.Name}");
                }
            }
        }

        // Test 4: EndpointDataSource inventory has no Catalog RPC
        var endpointDataSource = app.Services.GetRequiredService<EndpointDataSource>();
        foreach (var endpoint in endpointDataSource.Endpoints)
        {
            var displayName = endpoint.DisplayName ?? "";
            Require(!displayName.Contains("CatalogGrpcService", StringComparison.OrdinalIgnoreCase),
                $"Endpoint contains CatalogGrpcService: {displayName}");
            Require(!displayName.Contains("CatalogProto", StringComparison.OrdinalIgnoreCase),
                $"Endpoint contains CatalogProto: {displayName}");
        }

        Console.WriteLine("PASS runtime checks");
    }
    finally
    {
        await app.StopAsync();
        await app.DisposeAsync();
        try
        {
            if (Directory.Exists(tempContentRoot))
            {
                Directory.Delete(tempContentRoot, recursive: true);
            }
        }
        catch { }
    }
}

static string CreateJwt(string key, string issuer, string audience, DateTime? expires = null, DateTime? notBefore = null)
{
    var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
    var claims = new[]
    {
        new Claim("name", Guid.NewGuid().ToString()),
        new Claim("unique_name", "test_user"),
        new Claim("role", Guid.NewGuid().ToString())
    };
    var now = DateTime.UtcNow;
    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        notBefore: notBefore ?? now.AddMinutes(-5),
        expires: expires ?? now.AddHours(1),
        signingCredentials: credentials);
    return new JwtSecurityTokenHandler().WriteToken(token);
}
