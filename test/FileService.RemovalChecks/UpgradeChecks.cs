using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Blocks.FileService;
using Blocks.Shared.DTOs.Base;
using Grpc.Core;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

using EphemeralAuditResponder = FileBoundaryChecks.EphemeralAuditResponder;

internal static class UpgradeChecks
{
    private const string JwtSecret = "super_secret_test_key_for_file_upgrade_checks_32_bytes!";
    private const string JwtIssuer = "TestUpgradeIssuer";
    private const string JwtAudience = "TestUpgradeAudience";

    internal static async Task RunAsync(Func<string, Func<Task>, Task> check)
    {
        await check("audit_retry_success_and_terminal_failure_keep_baseline", CheckAuditRetryAndFailureBaselineAsync);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static string CreateJwt(Guid actorId, string username = "testuser")
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var expires = DateTime.UtcNow.AddHours(1);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D")),
                new Claim("unique_name", username)
            }),
            NotBefore = DateTime.UtcNow,
            Expires = expires,
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSecret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private static async Task CheckAuditRetryAndFailureBaselineAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));

        // Case 1: Retry success (call 1 fails with grpc-status 14, call 2 succeeds with grpc-status 0)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? StatusCode.Unavailable : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-retry-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_retry_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 10, 20, 30 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "retry_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");
                var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
                Require(env?.Success == true, "upload application success");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");

                var reqs = responder.ReceivedRequests;
                Require(reqs.Count > 0, "at least one request payload captured");
                var lastReq = reqs.Last();
                Require(lastReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(lastReq.UserName == "file_retry_actor", "actor UserName matches JWT claim");
                Require(lastReq.ServiceName == "FileService", "ServiceName is FileService");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 2: Terminal failure (all calls fail with grpc-status 14 -> 3 retries, total 4 attempts)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(_ => StatusCode.Unavailable);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-terminal-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_terminal_actor");

            var logSink = new TestLogSink();
            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            fileApp.Services.GetRequiredService<ILoggerFactory>().AddProvider(logSink);
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 40, 50, 60 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "terminal_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200 despite audit failure");
                var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
                Require(env?.Success == true, "upload application success");

                // Wait for all 4 attempts (1 initial + 3 retries: 2s + 4s + 8s = 14s total wait)
                var completedAllAttempts = await responder.WaitForCallsAsync(4, TimeSpan.FromSeconds(30));
                Require(completedAllAttempts, $"expected 4 transport attempts before terminal giveup, got {responder.AuditCalls}");
                Require(responder.AuditCalls == 4, $"total transport attempts must be exactly 4, got {responder.AuditCalls}");

                // Wait for logger to capture terminal log
                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(5) && !logSink.HasMessage("AUDIT LOG LOST"))
                {
                    await Task.Delay(50);
                }
                Require(logSink.HasMessage("AUDIT LOG LOST"), "terminal failure must log AUDIT LOG LOST");

                var reqs = responder.ReceivedRequests;
                Require(reqs.Count > 0, "request payload captured on terminal failure");
                var firstReq = reqs[0];
                Require(firstReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(firstReq.UserName == "file_terminal_actor", "actor UserName matches JWT claim");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 3: Upstream HTTP 503 then HTTP 200 (resilience characterization)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)503 : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-503-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_503_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 70, 80 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "503_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after HTTP 503");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 4: Connection disconnect/abort then HTTP 200
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)999 : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-abort-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_abort_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 90, 100 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "abort_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after connection abort");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }
    }

    private sealed class TestLogSink : ILoggerProvider, ILogger
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> _messages = new();

        public bool HasMessage(string fragment) =>
            _messages.Any(m => m.Contains(fragment, StringComparison.OrdinalIgnoreCase));

        public ILogger CreateLogger(string categoryName) => this;
        public void Dispose() { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var msg = formatter(state, exception);
            if (exception != null) msg += " " + exception.Message;
            _messages.Enqueue(msg);
        }
    }
}
