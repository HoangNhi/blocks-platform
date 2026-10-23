using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Blocks.ApiGateway;
using Blocks.FileService;
using Blocks.FileService.Protos;
using Blocks.Shared.DTOs.Base;
using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Web;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Yarp.ReverseProxy;
using Yarp.ReverseProxy.Model;

internal static class FileBoundaryChecks
{
    private const string JwtSecret = "super_secret_test_key_for_gateway_boundary_hardening_32_bytes!!";
    private const string JwtIssuer = "TestBoundaryIssuer";
    private const string JwtAudience = "TestBoundaryAudience";

    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4S8AAAAASUVORK5CYII=");

    private static readonly Method<UploadDataRequest, UploadDataResponse> UploadDataMethod = new(
        MethodType.Unary,
        "file.FileProto",
        "UploadData",
        Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => UploadDataRequest.Parser.ParseFrom(b)),
        Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => UploadDataResponse.Parser.ParseFrom(b))
    );

    private static readonly Method<PreviewFileRequest, PreviewFileResponse> PreviewFileMethod = new(
        MethodType.Unary,
        "file.FileProto",
        "PreviewFile",
        Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => PreviewFileRequest.Parser.ParseFrom(b)),
        Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => PreviewFileResponse.Parser.ParseFrom(b))
    );

    internal static async Task RunAsync(Func<string, Func<Task>, Task> check)
    {
        AppContext.SetSwitch("System.Net.Http.SocketsHttpHandler.Http2UnencryptedSupport", true);

        await check("boundary_rejects_missing_file_prefix_and_unregistered_clusters", CheckPrefixAndClusterScopingAsync);
        await check("boundary_enforces_exact_transforms_and_rejects_bypass", CheckTransformsAndBypassAsync);
        await check("boundary_blocks_unauthorized_paths_methods_and_rpc", CheckPathsMethodsAndRpcBlockingAsync);
        await check("boundary_runtime_config_reload_blocks_malicious_transform", CheckRuntimeConfigReloadAsync);
        await check("boundary_static_sentinels_in_webroot_and_storage_not_served", CheckStaticSentinelsAsync);
        await check("boundary_avatar_delivery_auth_headers_and_payload", CheckAvatarDeliveryAuthAsync);
        await check("boundary_native_http2_and_grpc_web_rpc_blocked_at_gateway", CheckRpcBlockedThroughGatewayAsync);
        await check("wire_grpc_error_statuses_and_actor_mismatch", CheckWireGrpcErrorStatusesAsync);
    }

    private static void Require([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static string CreateJwt(Guid actorId, TimeSpan? lifetime = null, string? username = "testuser", string? key = null)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var lifetimeSpan = lifetime ?? TimeSpan.FromHours(1);
        var expires = DateTime.UtcNow.Add(lifetimeSpan);
        var notBefore = lifetimeSpan < TimeSpan.Zero ? expires.AddHours(-1) : DateTime.UtcNow;
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D")),
                new Claim("unique_name", username ?? string.Empty)
            }),
            NotBefore = notBefore,
            IssuedAt = notBefore,
            Expires = expires,
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? JwtSecret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private sealed class DownstreamRecorder : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private int _totalRequests;
        private int _rpcRequests;
        private int _httpRequests;

        public int TotalRequests => Volatile.Read(ref _totalRequests);
        public int RpcRequests => Volatile.Read(ref _rpcRequests);
        public int HttpRequests => Volatile.Read(ref _httpRequests);
        public string Url { get; private set; } = string.Empty;

        private DownstreamRecorder(WebApplication app)
        {
            _app = app;
        }

        public static async Task<DownstreamRecorder> StartAsync()
        {
            var builder = WebApplication.CreateBuilder(new[] { "--urls", "http://127.0.0.1:0" });
            builder.WebHost.ConfigureKestrel(k =>
            {
                k.ConfigureEndpointDefaults(lo => lo.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1AndHttp2);
            });

            var app = builder.Build();
            var recorder = new DownstreamRecorder(app);

            app.Run(async context =>
            {
                Interlocked.Increment(ref recorder._totalRequests);
                var path = context.Request.Path.Value ?? string.Empty;
                var contentType = context.Request.ContentType ?? string.Empty;

                if (path.Contains("FileProto", StringComparison.OrdinalIgnoreCase) ||
                    contentType.StartsWith("application/grpc", StringComparison.OrdinalIgnoreCase))
                {
                    Interlocked.Increment(ref recorder._rpcRequests);
                }
                else
                {
                    Interlocked.Increment(ref recorder._httpRequests);
                }

                context.Response.StatusCode = StatusCodes.Status200OK;
                await context.Response.WriteAsync("downstream ok");
            });

            await app.StartAsync();
            recorder.Url = app.Urls.First();
            return recorder;
        }

        public void Reset()
        {
            Interlocked.Exchange(ref _totalRequests, 0);
            Interlocked.Exchange(ref _rpcRequests, 0);
            Interlocked.Exchange(ref _httpRequests, 0);
        }

        public async ValueTask DisposeAsync()
        {
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }


internal sealed class EphemeralAuditResponder : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly TaskCompletionSource<bool> _auditReceived = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<Blocks.SystemService.Protos.WriteAuditLogRequest> _receivedRequests = new();
    private readonly List<string> _protocols = new();
    private readonly List<string> _authHeaders = new();
    private int _auditCalls;
    private int _inFlight;

    public string Url { get; private set; } = string.Empty;
    public string Address => Url;
    public int AuditCalls => Volatile.Read(ref _auditCalls);
    public IReadOnlyList<string> Protocols { get { lock (_protocols) return _protocols.ToList(); } }
    public IReadOnlyList<string> AuthHeaders { get { lock (_authHeaders) return _authHeaders.ToList(); } }
    public IReadOnlyList<Blocks.SystemService.Protos.WriteAuditLogRequest> ReceivedRequests
    {
        get
        {
            lock (_receivedRequests)
            {
                return _receivedRequests.ToList();
            }
        }
    }

    private EphemeralAuditResponder(WebApplication app)
    {
        _app = app;
    }

    public static Task<EphemeralAuditResponder> StartAsync()
    {
        return StartAsync(_ => Grpc.Core.StatusCode.OK);
    }

    public static async Task<EphemeralAuditResponder> StartAsync(Func<int, Grpc.Core.StatusCode> statusForCall)
    {
        var builder = WebApplication.CreateBuilder(new[] { "--urls", "http://127.0.0.1:0" });
        var app = builder.Build();
        var responder = new EphemeralAuditResponder(app);

        app.MapPost("/audit.AuditProto/WriteAuditLog", async context =>
        {
            Interlocked.Increment(ref responder._inFlight);
            try
            {
                var callIndex = Interlocked.Increment(ref responder._auditCalls);
                var statusCode = statusForCall(callIndex);
                lock (responder._protocols)
                {
                    responder._protocols.Add(context.Request.Protocol);
                    responder._authHeaders.Add(context.Request.Headers["x-service-authorization"].ToString());
                }

                if ((int)statusCode == 503)
                {
                    context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                    context.Response.ContentType = "text/plain";
                    await context.Response.WriteAsync("Service Unavailable");
                    return;
                }
                if ((int)statusCode == 999)
                {
                    context.Abort();
                    return;
                }

                try
                {
                    var ms = new MemoryStream();
                    await context.Request.Body.CopyToAsync(ms);
                    var bytes = ms.ToArray();
                    if (bytes.Length >= 5)
                    {
                        var length = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(1, 4));
                        if (bytes.Length >= 5 + length)
                        {
                            var reqBytes = bytes.AsSpan(5, length).ToArray();
                            var req = Blocks.SystemService.Protos.WriteAuditLogRequest.Parser.ParseFrom(reqBytes);
                            lock (responder._receivedRequests)
                            {
                                responder._receivedRequests.Add(req);
                            }
                        }
                    }
                }
                catch { }

                context.Response.ContentType = "application/grpc-web";

                if (statusCode == Grpc.Core.StatusCode.OK)
                {
                    var reply = new Blocks.SystemService.Protos.WriteAuditLogReply { Success = true, Message = "ok" };
                    var replyBytes = Google.Protobuf.MessageExtensions.ToByteArray(reply);
                    var trailerBytes = Encoding.ASCII.GetBytes("grpc-status:0\r\n");

                    var body = new byte[5 + replyBytes.Length + 5 + trailerBytes.Length];
                    body[0] = 0;
                    System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(1, 4), replyBytes.Length);
                    replyBytes.CopyTo(body.AsSpan(5));

                    var tOffset = 5 + replyBytes.Length;
                    body[tOffset] = 0x80;
                    System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(tOffset + 1, 4), trailerBytes.Length);
                    trailerBytes.CopyTo(body.AsSpan(tOffset + 5));

                    await context.Response.Body.WriteAsync(body);
                    responder._auditReceived.TrySetResult(true);
                }
                else
                {
                    var trailerBytes = Encoding.ASCII.GetBytes($"grpc-status:{(int)statusCode}\r\ngrpc-message:{statusCode}\r\n");
                    var body = new byte[5 + trailerBytes.Length];
                    body[0] = 0x80;
                    System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(1, 4), trailerBytes.Length);
                    trailerBytes.CopyTo(body.AsSpan(5));

                    await context.Response.Body.WriteAsync(body);
                }
            }
            finally
            {
                Interlocked.Decrement(ref responder._inFlight);
            }
        });

        await app.StartAsync();
        responder.Url = app.Urls.First();
        return responder;
    }

    public async Task<bool> WaitForCallsAsync(int count, TimeSpan timeout)
    {
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed < timeout)
        {
            if (Volatile.Read(ref _auditCalls) >= count) return true;
            await Task.Delay(20);
        }
        return Volatile.Read(ref _auditCalls) >= count;
    }

    public async Task<bool> WaitForCallAsync(TimeSpan timeout)
    {
        var delayTask = Task.Delay(timeout);
        var completed = await Task.WhenAny(_auditReceived.Task, delayTask);
        return completed == _auditReceived.Task;
    }

    public async Task DrainAsync(TimeSpan timeout)
    {
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed < timeout && Volatile.Read(ref _inFlight) > 0)
        {
            await Task.Delay(20);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DrainAsync(TimeSpan.FromSeconds(2));
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}

    private static async Task CheckPrefixAndClusterScopingAsync()
    {
        await using var downstream = await DownstreamRecorder.StartAsync();

        var otherBuilder = WebApplication.CreateBuilder(new[] { "--urls", "http://127.0.0.1:0" });
        var otherApp = otherBuilder.Build();
        otherApp.MapMethods("/test", new[] { "GET", "OPTIONS" }, () => "other cluster ok");
        await otherApp.StartAsync();
        var otherUrl = otherApp.Urls.First();

        var gwApp = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--FileProxy:ClusterId", "fileCluster",
            "--ReverseProxy:Clusters:fileCluster:Destinations:d1:Address", downstream.Url,
            "--ReverseProxy:Routes:fileRoute:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
            "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
                "--ReverseProxy:Clusters:renamedCluster:Destinations:d1:Address", downstream.Url,
                "--ReverseProxy:Routes:renamedRoute:ClusterId", "renamedCluster",
                "--ReverseProxy:Routes:renamedRoute:Match:Path", "/RenamedAlias/{**catch-all}",
                "--ReverseProxy:Routes:renamedRoute:Transforms:0:PathRemovePrefix", "/RenamedAlias",

            "--ReverseProxy:Clusters:otherCluster:Destinations:d2:Address", otherUrl,
            "--ReverseProxy:Routes:otherRoute:ClusterId", "otherCluster",
            "--ReverseProxy:Routes:otherRoute:Match:Path", "/Other/{**catch-all}",
            "--ReverseProxy:Routes:otherRoute:Transforms:0:PathRemovePrefix", "/Other",

            "--ReverseProxy:Routes:aliasRoute:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:aliasRoute:Match:Path", "/Alias/{**catch-all}",
            "--ReverseProxy:Routes:aliasRoute:Transforms:0:PathRemovePrefix", "/Alias",

            "--ReverseProxy:Routes:wrongPrefixRoute:ClusterId", "otherCluster",
            "--ReverseProxy:Routes:wrongPrefixRoute:Match:Path", "/File/WrongCluster/{**catch-all}",
            "--ReverseProxy:Routes:wrongPrefixRoute:Transforms:0:PathRemovePrefix", "/File",

            "--Environment", "Production"
        });
        await gwApp.StartAsync();
        using var gwClient = new HttpClient { BaseAddress = new Uri(gwApp.Urls.First()) };

        try
        {
            var otherResp = await gwClient.GetAsync("/Other/test");
            Require(otherResp.IsSuccessStatusCode, "other cluster should succeed");
            var otherText = await otherResp.Content.ReadAsStringAsync();
            Require(otherText == "other cluster ok", "other cluster content must match");

            using var optReqOther = new HttpRequestMessage(HttpMethod.Options, "/Other/test");
            var optRespOther = await gwClient.SendAsync(optReqOther);
            Require(optRespOther.IsSuccessStatusCode, "OPTIONS to other cluster with valid config must succeed");

            downstream.Reset();
            var aliasResp = await gwClient.PostAsync("/Alias/api/UploadFile", new StringContent("test"));
            var aliasJson = await aliasResp.Content.ReadAsStringAsync();
            var aliasEnv = JsonSerializer.Deserialize<BaseResponse>(aliasJson);
            Require(aliasEnv != null && aliasEnv.StatusCode == 403 && !aliasEnv.Success, "alias route to file cluster must be 403");
            Require(downstream.TotalRequests == 0, "downstream recorder must not receive calls from alias route");

            var wrongResp = await gwClient.GetAsync("/File/WrongCluster/test");
            var wrongJson = await wrongResp.Content.ReadAsStringAsync();
            var wrongEnv = JsonSerializer.Deserialize<BaseResponse>(wrongJson);
            Require(wrongEnv != null && wrongEnv.StatusCode == 403 && !wrongEnv.Success, "File prefix to wrong cluster must be 403");

            var unconfGwApp = GatewayHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--ReverseProxy:Clusters:renamedCluster:Destinations:d1:Address", downstream.Url,
                "--ReverseProxy:Routes:fileRoute:ClusterId", "renamedCluster",
                "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
                "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
                "--ReverseProxy:Routes:renamedRoute:ClusterId", "renamedCluster",
                "--ReverseProxy:Routes:renamedRoute:Match:Path", "/RenamedAlias/{**catch-all}",
                "--ReverseProxy:Routes:renamedRoute:Transforms:0:PathRemovePrefix", "/RenamedAlias",
                "--Environment", "Production"
            });
            await unconfGwApp.StartAsync();
            using var unconfGwClient = new HttpClient { BaseAddress = new Uri(unconfGwApp.Urls.First()) };
            try
            {
                downstream.Reset();
                var unconfResp = await unconfGwClient.PostAsync("/File/api/UploadFile", new StringContent("test"));
                var unconfJson = await unconfResp.Content.ReadAsStringAsync();
                var unconfEnv = JsonSerializer.Deserialize<BaseResponse>(unconfJson);
                Require(unconfEnv != null && unconfEnv.StatusCode == 403 && !unconfEnv.Success, "missing cluster id must block File route");
                Require(downstream.TotalRequests == 0, "downstream must not receive calls when cluster id is unconfigured");

                downstream.Reset();
                var renamedResp = await unconfGwClient.PostAsync("/RenamedAlias/api/UploadFile", new StringContent("test"));
                var renamedJson = await renamedResp.Content.ReadAsStringAsync();
                var renamedEnv = JsonSerializer.Deserialize<BaseResponse>(renamedJson);
                Require(renamedEnv != null && renamedEnv.StatusCode == 403 && !renamedEnv.Success, "missing cluster id must block renamed cluster and non-/File alias route");
                Require(downstream.TotalRequests == 0, "downstream must not receive calls when cluster id is unconfigured for renamed alias route");
            }
            finally
            {
                await unconfGwApp.StopAsync();
                await unconfGwApp.DisposeAsync();
            }
        }
        finally
        {
            await gwApp.StopAsync();
            await gwApp.DisposeAsync();
            await otherApp.StopAsync();
            await otherApp.DisposeAsync();
        }
    }
    private static async Task CheckTransformsAndBypassAsync()
    {
        await using var downstream = await DownstreamRecorder.StartAsync();

        var gwApp = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--FileProxy:ClusterId", "fileCluster",
            "--ReverseProxy:Clusters:fileCluster:Destinations:d1:Address", downstream.Url,

            "--ReverseProxy:Routes:noTransforms:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:noTransforms:Match:Path", "/File/noTransform/{**catch-all}",

            "--ReverseProxy:Routes:extraTransforms:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:extraTransforms:Match:Path", "/File/extraTransform/{**catch-all}",
            "--ReverseProxy:Routes:extraTransforms:Transforms:0:PathRemovePrefix", "/File",
            "--ReverseProxy:Routes:extraTransforms:Transforms:1:PathPrefix", "/bypass",

            "--ReverseProxy:Routes:duplicateTransform:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:duplicateTransform:Match:Path", "/File/duplicateTransform/{**catch-all}",
            "--ReverseProxy:Routes:duplicateTransform:Transforms:0:PathRemovePrefix", "/File",
            "--ReverseProxy:Routes:duplicateTransform:Transforms:1:PathRemovePrefix", "/File",

            "--ReverseProxy:Routes:wrongValue:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:wrongValue:Match:Path", "/File/wrongValue/{**catch-all}",
            "--ReverseProxy:Routes:wrongValue:Transforms:0:PathRemovePrefix", "/Other",

            "--Environment", "Production"
        });
        await gwApp.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(gwApp.Urls.First()) };

        try
        {
            downstream.Reset();

            foreach (var testPath in new[]
            {
                "/File/noTransform/api/UploadFile",
                "/File/extraTransform/api/UploadFile",
                "/File/duplicateTransform/api/UploadFile",
                "/File/wrongValue/api/UploadFile"
            })
            {
                var resp = await client.PostAsync(testPath, new StringContent("test"));
                var json = await resp.Content.ReadAsStringAsync();
                var env = JsonSerializer.Deserialize<BaseResponse>(json);
                Require(env != null && env.StatusCode == 403 && !env.Success, $"bypass transform {testPath} must return 403");
            }

            Require(downstream.TotalRequests == 0, "downstream recorder must have received 0 requests for invalid transforms");

            using var optBypassReq = new HttpRequestMessage(HttpMethod.Options, "/File/noTransform/api/UploadFile");
            var optBypassResp = await client.SendAsync(optBypassReq);
            var optBypassJson = await optBypassResp.Content.ReadAsStringAsync();
            var optBypassEnv = JsonSerializer.Deserialize<BaseResponse>(optBypassJson);
            Require(optBypassEnv != null && optBypassEnv.StatusCode == 403 && !optBypassEnv.Success, "OPTIONS to transform bypass route must return 403 envelope");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 calls for OPTIONS bypass attempt");
        }
        finally
        {
            await gwApp.StopAsync();
            await gwApp.DisposeAsync();
        }
    }

    private static async Task CheckPathsMethodsAndRpcBlockingAsync()
    {
        await using var downstream = await DownstreamRecorder.StartAsync();

        var gwApp = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--FileProxy:ClusterId", "fileCluster",
            "--ReverseProxy:Clusters:fileCluster:Destinations:d1:Address", downstream.Url,
            "--ReverseProxy:Routes:fileRoute:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
            "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
            "--Environment", "Production"
        });
        await gwApp.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(gwApp.Urls.First()) };

        try
        {
            downstream.Reset();
            var upResp = await client.PostAsync("/File/api/UploadFile", new StringContent("test"));
            Require(upResp.IsSuccessStatusCode, "POST /File/api/UploadFile should be allowed through gateway");

            var embedResp = await client.PostAsync("/File/api/UploadFile/embed", new StringContent("test"));
            Require(embedResp.IsSuccessStatusCode, "POST /File/api/UploadFile/embed should be allowed through gateway");

            var avatarGuid = Guid.NewGuid();
            var avResp = await client.GetAsync($"/File/api/Avatar/{avatarGuid:D}.png");
            Require(avResp.IsSuccessStatusCode, "GET /File/api/Avatar/{guid}.png should be allowed through gateway");
            Require(downstream.TotalRequests == 3, "allowed requests must reach downstream");

            downstream.Reset();
            using var optReqFile = new HttpRequestMessage(HttpMethod.Options, "/File/api/UploadFile");
            var optRespFile = await client.SendAsync(optReqFile);
            var optJsonFile = await optRespFile.Content.ReadAsStringAsync();
            var optEnvFile = JsonSerializer.Deserialize<BaseResponse>(optJsonFile);
            Require(optEnvFile != null && optEnvFile.StatusCode == 403 && !optEnvFile.Success, "OPTIONS to File cluster must return 403 envelope");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 calls for OPTIONS to File cluster");

            downstream.Reset();
            foreach (var req in new[]
            {
                new HttpRequestMessage(HttpMethod.Get, "/File/api/UploadFile"),
                new HttpRequestMessage(HttpMethod.Delete, "/File/api/UploadFile"),
                new HttpRequestMessage(HttpMethod.Put, "/File/api/UploadFile/embed"),
                new HttpRequestMessage(HttpMethod.Post, $"/File/api/Avatar/{avatarGuid:D}.png"),
                new HttpRequestMessage(HttpMethod.Delete, $"/File/api/Avatar/{avatarGuid:D}.png")
            })
            {
                var resp = await client.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();
                var env = JsonSerializer.Deserialize<BaseResponse>(json);
                Require(env != null && env.StatusCode == 403 && !env.Success, $"method {req.Method} on {req.RequestUri} must be 403");
            }

            foreach (var badAvatar in new[]
            {
                "/File/api/Avatar/test.svg",
                $"/File/api/Avatar/{avatarGuid:D}.svg",
                $"/File/api/Avatar/{avatarGuid:D}.html",
                $"/File/api/Avatar/{avatarGuid:D}.txt",
                "/File/api/Avatar/not-a-guid.png",
                "/File/api/Avatar/",
                "/File/api/Avatar/../../secret.txt"
            })
            {
                var resp = await client.GetAsync(badAvatar);
                var json = await resp.Content.ReadAsStringAsync();
                var env = JsonSerializer.Deserialize<BaseResponse>(json);
                Require(env != null && env.StatusCode == 403 && !env.Success, $"avatar path {badAvatar} must be 403");
            }

            foreach (var rpcPath in new[]
            {
                "/File/file.FileProto/PreviewFile",
                "/File/file.FileProto/UploadData",
                "/File/Blocks.FileService.Protos.FileProto/UploadData"
            })
            {
                using var msg = new HttpRequestMessage(HttpMethod.Post, rpcPath)
                {
                    Content = new ByteArrayContent(Array.Empty<byte>())
                };
                msg.Content.Headers.ContentType = new MediaTypeHeaderValue("application/grpc");
                var resp = await client.SendAsync(msg);
                var json = await resp.Content.ReadAsStringAsync();
                var env = JsonSerializer.Deserialize<BaseResponse>(json);
                Require(env != null && env.StatusCode == 403 && !env.Success, $"RPC path {rpcPath} must be 403");
            }

            foreach (var grpcWebType in new[] { "application/grpc-web", "application/grpc-web+proto", "application/grpc-web-text" })
            {
                using var msg = new HttpRequestMessage(HttpMethod.Post, "/File/api/UploadFile")
                {
                    Content = new ByteArrayContent(Array.Empty<byte>())
                };
                msg.Content.Headers.ContentType = new MediaTypeHeaderValue(grpcWebType);
                var resp = await client.SendAsync(msg);
                var json = await resp.Content.ReadAsStringAsync();
                var env = JsonSerializer.Deserialize<BaseResponse>(json);
                Require(env != null && env.StatusCode == 403 && !env.Success, $"gRPC-Web content-type {grpcWebType} must be 403");
            }

            Require(downstream.TotalRequests == 0, "downstream recorder must have received 0 calls for blocked requests");
        }
        finally
        {
            await gwApp.StopAsync();
            await gwApp.DisposeAsync();
        }
    }

    private static async Task CheckRuntimeConfigReloadAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-gw-reload-{Guid.NewGuid():N}");
        Directory.CreateDirectory(fixtureDir);

        await using var downstream = await DownstreamRecorder.StartAsync();

        var initialConfig = new
        {
            FileProxy = new { ClusterId = "fileCluster" },
            ReverseProxy = new
            {
                Routes = new Dictionary<string, object>
                {
                    ["fileRoute"] = new
                    {
                        ClusterId = "fileCluster",
                        Match = new { Path = "/File/{**catch-all}" },
                        Transforms = new[] { new Dictionary<string, string> { ["PathRemovePrefix"] = "/File" } }
                    }
                },
                Clusters = new Dictionary<string, object>
                {
                    ["fileCluster"] = new
                    {
                        Destinations = new Dictionary<string, object>
                        {
                            ["d1"] = new { Address = downstream.Url }
                        }
                    }
                }
            }
        };

        var configFile = Path.Combine(fixtureDir, "appsettings.Production.json");
        await File.WriteAllTextAsync(configFile, JsonSerializer.Serialize(initialConfig));

        var gwApp = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--contentRoot", fixtureDir,
            "--Environment", "Production"
        });
        await gwApp.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(gwApp.Urls.First()) };

        try
        {
            var initResp = await client.PostAsync("/File/api/UploadFile", new StringContent("test"));
            Require(initResp.IsSuccessStatusCode, "initial route should proxy");
            Require(downstream.TotalRequests == 1, "downstream received initial request");

            // Alter allowed /File route transform on the SAME route to rewrite to RPC target
            var maliciousConfig = new
            {
                FileProxy = new { ClusterId = "fileCluster" },
                ReverseProxy = new
                {
                    Routes = new Dictionary<string, object>
                    {
                        ["fileRoute"] = new
                        {
                            ClusterId = "fileCluster",
                            Match = new { Path = "/File/{**catch-all}" },
                            Transforms = new[]
                            {
                                new Dictionary<string, string> { ["PathSet"] = "/file.FileProto/UploadData" }
                            }
                        }
                    },
                    Clusters = new Dictionary<string, object>
                    {
                        ["fileCluster"] = new
                        {
                            Destinations = new Dictionary<string, object>
                            {
                                ["d1"] = new { Address = downstream.Url }
                            }
                        }
                    }
                }
            };

            await File.WriteAllTextAsync(configFile, JsonSerializer.Serialize(maliciousConfig));

            var proxyState = gwApp.Services.GetRequiredService<IProxyStateLookup>();
            Require(proxyState != null, "IProxyStateLookup must be available from YARP runtime");

            var configRoot = (IConfigurationRoot)gwApp.Services.GetRequiredService<IConfiguration>();
            configRoot.Reload();

            var sw = Stopwatch.StartNew();
            var reloaded = false;
            while (sw.ElapsedMilliseconds < 5000)
            {
                if (proxyState.TryGetRoute("fileRoute", out var routeModel) &&
                    routeModel?.Config?.Transforms?.Any(t => t.ContainsKey("PathSet")) == true)
                {
                    reloaded = true;
                    break;
                }
                await Task.Delay(20);
            }
            Require(reloaded, "YARP configuration did not reload malicious route transform within 5s");

            downstream.Reset();

            // Client makes request to the SAME allowed URL
            var blockedResp = await client.PostAsync("/File/api/UploadFile", new StringContent("test"));
            var blockedJson = await blockedResp.Content.ReadAsStringAsync();
            var blockedEnv = JsonSerializer.Deserialize<BaseResponse>(blockedJson);
            Require(blockedEnv != null && blockedEnv.StatusCode == 403 && !blockedEnv.Success,
                "reloaded route with altered transform must be blocked with 403 envelope");
            Require(downstream.RpcRequests == 0, "downstream must receive 0 RPC calls after config reload");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 calls total through route with malicious transform");
        }
        finally
        {
            await gwApp.StopAsync();
            await gwApp.DisposeAsync();
            Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == tempRoot, "Unsafe cleanup");
            Directory.Delete(fixtureDir, recursive: true);
        }
    }
    private static async Task CheckStaticSentinelsAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-static-{Guid.NewGuid():N}");
        var webDir = Path.Combine(fixtureDir, "wwwroot");
        var storageDir = Path.Combine(fixtureDir, "storage");

        Directory.CreateDirectory(webDir);
        Directory.CreateDirectory(storageDir);

        await File.WriteAllTextAsync(Path.Combine(webDir, "sentinel.txt"), "web sentinel");
        Directory.CreateDirectory(Path.Combine(webDir, "Files", "System", "Attachments", "11111111-1111-1111-1111-111111111111"));
        await File.WriteAllTextAsync(Path.Combine(webDir, "Files", "System", "Attachments", "11111111-1111-1111-1111-111111111111", "secret.txt"), "attachment sentinel");
        Directory.CreateDirectory(Path.Combine(webDir, "Files", "Temp"));
        await File.WriteAllTextAsync(Path.Combine(webDir, "Files", "Temp", "sentinel.txt"), "temp sentinel");
        Directory.CreateDirectory(Path.Combine(webDir, "Files", "Deleted"));
        await File.WriteAllTextAsync(Path.Combine(webDir, "Files", "Deleted", "sentinel.txt"), "deleted sentinel");
        Directory.CreateDirectory(Path.Combine(webDir, "Files", "PdfCache"));
        await File.WriteAllTextAsync(Path.Combine(webDir, "Files", "PdfCache", "sentinel.txt"), "pdf cache sentinel");
        Directory.CreateDirectory(Path.Combine(webDir, "Temp"));
        await File.WriteAllTextAsync(Path.Combine(webDir, "Temp", "sentinel.txt"), "temp root sentinel");

        Directory.CreateDirectory(Path.Combine(storageDir, "Temp"));
        await File.WriteAllTextAsync(Path.Combine(storageDir, "Temp", "storage-sentinel.txt"), "storage temp sentinel");

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--contentRoot", fixtureDir,
            "--webroot", webDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });

        await fileApp.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(fileApp.Urls.First()) };

        try
        {
            var testPaths = new[]
            {
                "/sentinel.txt",
                "/Files/System/Attachments/11111111-1111-1111-1111-111111111111/secret.txt",
                "/Files/Temp/sentinel.txt",
                "/Files/Deleted/sentinel.txt",
                "/Files/PdfCache/sentinel.txt",
                "/Temp/sentinel.txt",
                "/storage/Temp/storage-sentinel.txt"
            };

            var validJwt = CreateJwt(Guid.NewGuid());

            foreach (var testPath in testPaths)
            {
                var anonResp = await client.GetAsync(testPath);
                Require(anonResp.StatusCode == HttpStatusCode.NotFound, $"anonymous static sentinel at {testPath} must return 404, got {anonResp.StatusCode}");

                using var authReq = new HttpRequestMessage(HttpMethod.Get, testPath);
                authReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
                var authResp = await client.SendAsync(authReq);
                Require(authResp.StatusCode == HttpStatusCode.NotFound, $"authenticated static sentinel at {testPath} must return 404, got {authResp.StatusCode}");
            }
        }
        finally
        {
            await fileApp.StopAsync();
            await fileApp.DisposeAsync();
            Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == tempRoot, "Unsafe cleanup");
            Directory.Delete(fixtureDir, recursive: true);
        }
    }

    private static async Task CheckAvatarDeliveryAuthAsync()
    {
        // Avatar endpoint does not trigger audit (only POST /api/UploadFile)
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-avatar-{Guid.NewGuid():N}");
        var storageDir = Path.Combine(fixtureDir, "storage");
        var avatarsDir = Path.Combine(storageDir, "Avatars");
        Directory.CreateDirectory(avatarsDir);

        var avatarGuid = Guid.NewGuid();
        var avatarFile = Path.Combine(avatarsDir, $"{avatarGuid:D}.png");
        await File.WriteAllBytesAsync(avatarFile, TinyPng);

        await using var auditResponder = await EphemeralAuditResponder.StartAsync();

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--GrpcClients:SystemService", auditResponder.Url,
            "--contentRoot", fixtureDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });
        await fileApp.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(fileApp.Urls.First()) };

        try
        {
            var avatarUrl = $"/api/Avatar/{avatarGuid:D}.png";

            var anonResp = await client.GetAsync(avatarUrl);
            var anonJson = await anonResp.Content.ReadAsStringAsync();
            var anonEnv = JsonSerializer.Deserialize<BaseResponse>(anonJson);
            Require(anonEnv != null && anonEnv.StatusCode == 401 && !anonEnv.Success, "anonymous avatar request must return 401 envelope");

            var expiredJwt = CreateJwt(Guid.NewGuid(), lifetime: TimeSpan.FromMinutes(-10));
            using (var reqExpired = new HttpRequestMessage(HttpMethod.Get, avatarUrl))
            {
                reqExpired.Headers.Authorization = new AuthenticationHeaderValue("Bearer", expiredJwt);
                var expiredResp = await client.SendAsync(reqExpired);
                var expiredJson = await expiredResp.Content.ReadAsStringAsync();
                var expiredEnv = JsonSerializer.Deserialize<BaseResponse>(expiredJson);
                Require(expiredEnv != null && expiredEnv.StatusCode == 401 && !expiredEnv.Success, "expired JWT avatar request must return 401 envelope");
            }

            var badSigJwt = CreateJwt(Guid.NewGuid(), key: "wrong_key_that_does_not_match_test_secret_32_bytes!");
            using (var reqBadSig = new HttpRequestMessage(HttpMethod.Get, avatarUrl))
            {
                reqBadSig.Headers.Authorization = new AuthenticationHeaderValue("Bearer", badSigJwt);
                var badSigResp = await client.SendAsync(reqBadSig);
                var badSigJson = await badSigResp.Content.ReadAsStringAsync();
                var badSigEnv = JsonSerializer.Deserialize<BaseResponse>(badSigJson);
                Require(badSigEnv != null && badSigEnv.StatusCode == 401 && !badSigEnv.Success, "bad signature JWT avatar request must return 401 envelope");
            }

            var validJwt = CreateJwt(Guid.NewGuid());
            using (var reqValid = new HttpRequestMessage(HttpMethod.Get, avatarUrl))
            {
                reqValid.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
                var validResp = await client.SendAsync(reqValid);
                Require(validResp.StatusCode == HttpStatusCode.OK, "valid JWT avatar request must return 200 OK");
                Require(validResp.Headers.CacheControl?.NoStore == true, "avatar response must have Cache-Control: no-store");
                Require(validResp.Headers.Contains("X-Content-Type-Options"), "avatar response must have X-Content-Type-Options");
                Require(validResp.Headers.GetValues("X-Content-Type-Options").Contains("nosniff"), "X-Content-Type-Options must be nosniff");
                Require(validResp.Content.Headers.ContentType?.MediaType == "image/png", "Content-Type must be image/png");
                var bodyBytes = await validResp.Content.ReadAsByteArrayAsync();
                Require(bodyBytes.SequenceEqual(TinyPng), "avatar body bytes must match stored TinyPng exactly");
            }

            using (var reqNotFound = new HttpRequestMessage(HttpMethod.Get, $"/api/Avatar/{Guid.NewGuid():D}.png"))
            {
                reqNotFound.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
                var notFoundResp = await client.SendAsync(reqNotFound);
                var notFoundJson = await notFoundResp.Content.ReadAsStringAsync();
                var notFoundEnv = JsonSerializer.Deserialize<BaseResponse>(notFoundJson);
                Require(notFoundResp.StatusCode == HttpStatusCode.NotFound || (notFoundEnv != null && notFoundEnv.StatusCode == 404 && !notFoundEnv.Success), "missing avatar must return 404");
            }
        }
        finally
        {
            await fileApp.StopAsync();
            await fileApp.DisposeAsync();
            Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == tempRoot, "Unsafe cleanup");
            Directory.Delete(fixtureDir, recursive: true);
        }
    }

    private static async Task CheckRpcBlockedThroughGatewayAsync()
    {
        await using var downstream = await DownstreamRecorder.StartAsync();

        var gwAppH2 = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--Kestrel:EndpointDefaults:Protocols", "Http2",
            "--FileProxy:ClusterId", "fileCluster",
            "--ReverseProxy:Clusters:fileCluster:Destinations:d1:Address", downstream.Url,
            "--ReverseProxy:Routes:fileRoute:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
            "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
            "--Environment", "Production"
        });
        await gwAppH2.StartAsync();
        var gwH2Url = gwAppH2.Urls.First();

        var gwAppH1 = GatewayHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--Kestrel:EndpointDefaults:Protocols", "Http1",
            "--FileProxy:ClusterId", "fileCluster",
            "--ReverseProxy:Clusters:fileCluster:Destinations:d1:Address", downstream.Url,
            "--ReverseProxy:Routes:fileRoute:ClusterId", "fileCluster",
            "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
            "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
            "--Environment", "Production"
        });
        await gwAppH1.StartAsync();
        var gwH1Url = gwAppH1.Urls.First();

        var validJwt = CreateJwt(Guid.NewGuid());

        try
        {
            downstream.Reset();
            using var http2Client = new HttpClient
            {
                DefaultRequestVersion = HttpVersion.Version20,
                DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
                Timeout = TimeSpan.FromSeconds(5)
            };
            using var h2Req = new HttpRequestMessage(HttpMethod.Post, $"{gwH2Url}/File/file.FileProto/UploadData")
            {
                Version = HttpVersion.Version20,
                VersionPolicy = HttpVersionPolicy.RequestVersionExact
            };
            h2Req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
            h2Req.Content = new ByteArrayContent(Array.Empty<byte>());
            h2Req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/grpc");

            var h2Resp = await http2Client.SendAsync(h2Req);
            var h2Json = await h2Resp.Content.ReadAsStringAsync();
            var h2Env = JsonSerializer.Deserialize<BaseResponse>(h2Json);
            Require(h2Env != null && h2Env.StatusCode == 403 && !h2Env.Success, "native HTTP/2 gRPC through gateway must return 403 envelope");
            Require(downstream.RpcRequests == 0, "downstream must receive 0 RPC calls for HTTP/2 gRPC");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 requests total for HTTP/2 gRPC");

            #pragma warning disable CS0618
        using var grpcWebHandler = new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler())
        {
            HttpVersion = new Version(1, 1)
        };
        #pragma warning restore CS0618
            using var grpcWebClient = new HttpClient(grpcWebHandler)
            {
                DefaultRequestVersion = HttpVersion.Version11,
                DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
                Timeout = TimeSpan.FromSeconds(5)
            };
            using var channel = GrpcChannel.ForAddress(gwH1Url, new GrpcChannelOptions { HttpClient = grpcWebClient });
            var invoker = channel.CreateCallInvoker();
            var meta = new Metadata { { "Authorization", $"Bearer {validJwt}" } };

            bool grpcWebBlocked = false;
            try
            {
                await invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(headers: meta, deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = Guid.NewGuid().ToString("D"),
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = Guid.NewGuid().ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException)
            {
                grpcWebBlocked = true;
            }

            Require(grpcWebBlocked, "gRPC-Web call through gateway must fail");
            Require(downstream.RpcRequests == 0, "downstream must receive 0 RPC calls for gRPC-Web");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 requests total for gRPC-Web");

            using var grpcWebFileReq = new HttpRequestMessage(HttpMethod.Post, $"{gwH1Url}/File/file.FileProto/UploadData");
            grpcWebFileReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
            grpcWebFileReq.Content = new ByteArrayContent(Array.Empty<byte>());
            grpcWebFileReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/grpc-web");
            using var h1Client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var gwFileResp = await h1Client.SendAsync(grpcWebFileReq);
            var gwFileJson = await gwFileResp.Content.ReadAsStringAsync();
            var gwFileEnv = JsonSerializer.Deserialize<BaseResponse>(gwFileJson);
            Require(gwFileEnv != null && gwFileEnv.StatusCode == 403 && !gwFileEnv.Success, "gRPC-Web /File RPC through gateway must return 403 envelope");
            Require(downstream.RpcRequests == 0, "downstream must receive 0 RPC calls for gRPC-Web /File");
            Require(downstream.TotalRequests == 0, "downstream must receive 0 requests total for gRPC-Web /File");

            var directResp = await http2Client.PostAsync($"{gwH2Url}/file.FileProto/UploadData", new ByteArrayContent(Array.Empty<byte>()));
            Require(!directResp.IsSuccessStatusCode, "direct RPC path without /File prefix must not succeed");
            Require(downstream.RpcRequests == 0, "downstream must receive 0 calls for direct RPC path");
        }
        finally
        {
            await gwAppH2.StopAsync();
            await gwAppH2.DisposeAsync();
            await gwAppH1.StopAsync();
            await gwAppH1.DisposeAsync();
        }
    }

    private static async Task CheckWireGrpcErrorStatusesAsync()
    {
        await using var auditResponder = await EphemeralAuditResponder.StartAsync();

        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-wire-grpc-{Guid.NewGuid():N}");
        var storageDir = Path.Combine(fixtureDir, "storage");
        Directory.CreateDirectory(storageDir);

        var fixtureDirH2 = Path.Combine(tempRoot, $"blocks-fs-wire-h2-{Guid.NewGuid():N}");
        var storageDirH2 = Path.Combine(fixtureDirH2, "storage");
        Directory.CreateDirectory(storageDirH2);

        var fileAppH2 = FileServiceHost.Build(new[]
        {
            "--Kestrel:Endpoints:Http:Url", "http://127.0.0.1:0",
            "--Kestrel:Endpoints:Http:Protocols", "Http2",
            "--GrpcClients:SystemService", auditResponder.Url,
            "--contentRoot", fixtureDirH2,
            "--FileStorage:RootPath", storageDirH2,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });
        await fileAppH2.StartAsync();
        var fileBaseUrlH2 = fileAppH2.Urls.First();

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--GrpcClients:SystemService", auditResponder.Url,
            "--contentRoot", fixtureDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });
        await fileApp.StartAsync();
        var fileBaseUrl = fileApp.Urls.First();

        #pragma warning disable CS0618
        using var grpcWebHandler = new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler())
        {
            HttpVersion = new Version(1, 1)
        };
        #pragma warning restore CS0618
        using var grpcHttpClient = new HttpClient(grpcWebHandler)
        {
            DefaultRequestVersion = HttpVersion.Version11,
            DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Timeout = TimeSpan.FromSeconds(5)
        };
        using var channel = GrpcChannel.ForAddress(fileBaseUrl, new GrpcChannelOptions { HttpClient = grpcHttpClient, DisposeHttpClient = false });
        var invoker = channel.CreateCallInvoker();

        try
        {
            bool unauthCaught = false;
            try
            {
                await invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = Guid.NewGuid().ToString("D"),
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = Guid.NewGuid().ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.Unauthenticated)
            {
                unauthCaught = true;
            }
            Require(unauthCaught, "missing JWT must return StatusCode.Unauthenticated over wire");

            var actorA = Guid.NewGuid();
            var tokenA = CreateJwt(actorA);
            var metaA = new Metadata { { "Authorization", $"Bearer {tokenA}" } };

            bool unimpCaught = false;
            try
            {
                await invoker.AsyncUnaryCall(PreviewFileMethod, null, new CallOptions(headers: metaA, deadline: DateTime.UtcNow.AddSeconds(5)), new PreviewFileRequest
                {
                    FileUrl = "System/Attachments/test/file.txt",
                    WatermarkText = "unsupported watermark"
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.Unimplemented)
            {
                unimpCaught = true;
            }
            Require(unimpCaught, "watermarking must return StatusCode.Unimplemented over wire");

            bool invalidArgCaught = false;
            try
            {
                await invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(headers: metaA, deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = "not-a-valid-guid",
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = Guid.NewGuid().ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.InvalidArgument)
            {
                invalidArgCaught = true;
            }
            Require(invalidArgCaught, "invalid GUID input must return StatusCode.InvalidArgument over wire");

            using var fileHttpClient = new HttpClient { BaseAddress = new Uri(fileBaseUrl), Timeout = TimeSpan.FromSeconds(5) };
            var batchFolderGuid = Guid.NewGuid();
            using var multipart = new MultipartFormDataContent();
            var payload = new ByteArrayContent(new byte[] { 1, 2, 3 });
            multipart.Add(payload, "files", "document.txt");
            multipart.Add(new StringContent(batchFolderGuid.ToString("D")), "FolderName");

            using var uploadReq = new HttpRequestMessage(HttpMethod.Post, "/api/UploadFile") { Content = multipart };
            uploadReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenA);
            var uploadResp = await fileHttpClient.SendAsync(uploadReq);
            Require(uploadResp.IsSuccessStatusCode, "Actor A upload stage must succeed");

            var auditDelivered = await auditResponder.WaitForCallAsync(TimeSpan.FromSeconds(3));
            Require(auditDelivered, "AuditActionFilter must deliver WriteAuditLog to ephemeral audit responder");
            Require(auditResponder.AuditCalls >= 1, "audit calls recorded must be at least 1");
            await auditResponder.DrainAsync(TimeSpan.FromSeconds(2));
            await Task.Delay(50);

            var actorB = Guid.NewGuid();
            var tokenB = CreateJwt(actorB);
            var metaB = new Metadata { { "Authorization", $"Bearer {tokenB}" } };

            bool mismatchCaught = false;
            try
            {
                await invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(headers: metaB, deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = Guid.NewGuid().ToString("D"),
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = batchFolderGuid.ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode is StatusCode.NotFound or StatusCode.PermissionDenied or StatusCode.FailedPrecondition)
            {
                mismatchCaught = true;
            }
            Require(mismatchCaught, "actor mismatch must return NotFound/PermissionDenied/FailedPrecondition over wire");

            using var h2Channel = GrpcChannel.ForAddress(fileBaseUrlH2);
            var h2Invoker = h2Channel.CreateCallInvoker();

            bool h2UnauthCaught = false;
            try
            {
                await h2Invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = Guid.NewGuid().ToString("D"),
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = Guid.NewGuid().ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.Unauthenticated)
            {
                h2UnauthCaught = true;
            }
            Require(h2UnauthCaught, "native HTTP/2 gRPC missing JWT must return StatusCode.Unauthenticated over wire");

            bool h2UnimpCaught = false;
            try
            {
                await h2Invoker.AsyncUnaryCall(PreviewFileMethod, null, new CallOptions(headers: metaA, deadline: DateTime.UtcNow.AddSeconds(5)), new PreviewFileRequest
                {
                    FileUrl = "System/Attachments/test/file.txt",
                    WatermarkText = "unsupported watermark"
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.Unimplemented)
            {
                h2UnimpCaught = true;
            }
            Require(h2UnimpCaught, "native HTTP/2 gRPC watermarking must return StatusCode.Unimplemented over wire");

            bool h2InvalidArgCaught = false;
            try
            {
                await h2Invoker.AsyncUnaryCall(UploadDataMethod, null, new CallOptions(headers: metaA, deadline: DateTime.UtcNow.AddSeconds(5)), new UploadDataRequest
                {
                    RelatedId = "not-a-valid-guid",
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = Guid.NewGuid().ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.InvalidArgument)
            {
                h2InvalidArgCaught = true;
            }
            Require(h2InvalidArgCaught, "native HTTP/2 gRPC invalid GUID input must return StatusCode.InvalidArgument over wire");
        }
        finally
        {
            channel.Dispose();
            await fileApp.StopAsync();
            await fileApp.DisposeAsync();
            Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == tempRoot, "Unsafe cleanup");
            Directory.Delete(fixtureDir, recursive: true);

            await fileAppH2.StopAsync();
            await fileAppH2.DisposeAsync();
            Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDirH2)) == tempRoot, "Unsafe cleanup");
            Directory.Delete(fixtureDirH2, recursive: true);
        }
    }
}
