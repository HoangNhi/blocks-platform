using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using Blocks.ServiceDefaults;
using Blocks.Shared.Common;
using Google.Protobuf;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

internal static class PlatformChecks
{
    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Assertion failed: {message}");
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Assertion failed: {message}");
        }
    }

    internal sealed class OtlpSpanRecord
    {
        public byte[] TraceId { get; set; } = Array.Empty<byte>();
        public byte[] SpanId { get; set; } = Array.Empty<byte>();
        public string Name { get; set; } = string.Empty;
    }

    private static List<OtlpSpanRecord> ParseOtlpTracePayload(byte[] payload)
    {
        var records = new List<OtlpSpanRecord>();
        var input = new CodedInputStream(payload);
        while (!input.IsAtEnd)
        {
            uint tag = input.ReadTag();
            if (tag == 0) break;
            int fieldNumber = WireFormat.GetTagFieldNumber(tag);
            var wireType = WireFormat.GetTagWireType(tag);

            if (fieldNumber == 1 && wireType == WireFormat.WireType.LengthDelimited)
            {
                var bytes = input.ReadBytes();
                ParseResourceSpans(new CodedInputStream(bytes.ToByteArray()), records);
            }
            else
            {
                input.SkipLastField();
            }
        }
        return records;
    }

    private static void ParseResourceSpans(CodedInputStream input, List<OtlpSpanRecord> records)
    {
        while (!input.IsAtEnd)
        {
            uint tag = input.ReadTag();
            if (tag == 0) break;
            int fieldNumber = WireFormat.GetTagFieldNumber(tag);
            var wireType = WireFormat.GetTagWireType(tag);

            if (fieldNumber == 2 && wireType == WireFormat.WireType.LengthDelimited)
            {
                var bytes = input.ReadBytes();
                ParseScopeSpans(new CodedInputStream(bytes.ToByteArray()), records);
            }
            else
            {
                input.SkipLastField();
            }
        }
    }

    private static void ParseScopeSpans(CodedInputStream input, List<OtlpSpanRecord> records)
    {
        while (!input.IsAtEnd)
        {
            uint tag = input.ReadTag();
            if (tag == 0) break;
            int fieldNumber = WireFormat.GetTagFieldNumber(tag);
            var wireType = WireFormat.GetTagWireType(tag);

            if (fieldNumber == 2 && wireType == WireFormat.WireType.LengthDelimited)
            {
                var bytes = input.ReadBytes();
                var spanRecord = ParseSpan(new CodedInputStream(bytes.ToByteArray()));
                records.Add(spanRecord);
            }
            else
            {
                input.SkipLastField();
            }
        }
    }

    private static OtlpSpanRecord ParseSpan(CodedInputStream input)
    {
        var record = new OtlpSpanRecord();
        while (!input.IsAtEnd)
        {
            uint tag = input.ReadTag();
            if (tag == 0) break;
            int fieldNumber = WireFormat.GetTagFieldNumber(tag);
            var wireType = WireFormat.GetTagWireType(tag);

            if (fieldNumber == 1 && wireType == WireFormat.WireType.LengthDelimited)
            {
                record.TraceId = input.ReadBytes().ToByteArray();
            }
            else if (fieldNumber == 2 && wireType == WireFormat.WireType.LengthDelimited)
            {
                record.SpanId = input.ReadBytes().ToByteArray();
            }
            else if (fieldNumber == 5 && wireType == WireFormat.WireType.LengthDelimited)
            {
                record.Name = input.ReadString();
            }
            else
            {
                input.SkipLastField();
            }
        }
        return record;
    }

    private sealed class TestActivityProcessor : BaseProcessor<Activity>
    {
        public readonly List<Activity> ProcessedActivities = new();

        public override void OnEnd(Activity activity)
        {
            lock (ProcessedActivities)
            {
                ProcessedActivities.Add(activity);
            }
        }
    }

    private static async Task ExecutePipelineAsync(HttpContext context, int forwardLimit)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddTrustedForwardedHeaders(forwardLimit: forwardLimit);
        using var sp = services.BuildServiceProvider();
        var app = new ApplicationBuilder(sp);
        app.UseTrustedForwardedHeaders();
        var pipeline = app.Build();
        await pipeline(context);
    }

    public static async Task RunAsync()
    {
        Console.WriteLine("Running PlatformChecks...");

        // 1. TFM and Runtime verification
        Assert(Environment.Version.Major == 10, "Runtime is .NET 10");

        // 2. Options and DI registration with forwardLimit = 1
        var services1 = new ServiceCollection();
        services1.AddTrustedForwardedHeaders(forwardLimit: 1);
        using (var sp1 = services1.BuildServiceProvider())
        {
            var options1 = sp1.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

            Assert(options1.ForwardedHeaders == (ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto),
                "ForwardedHeaders flags include XForwardedFor and XForwardedProto");
            Assert(options1.KnownIPNetworks.Count == 3, "Exactly 3 KnownIPNetworks registered");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "10.0.0.0" && n.PrefixLength == 8),
                "KnownIPNetworks contains 10.0.0.0/8");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "172.16.0.0" && n.PrefixLength == 12),
                "KnownIPNetworks contains 172.16.0.0/12");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "192.168.0.0" && n.PrefixLength == 16),
                "KnownIPNetworks contains 192.168.0.0/16");

            Assert(options1.KnownProxies.Count == 2, "Exactly 2 KnownProxies registered");
            Assert(options1.KnownProxies.Contains(IPAddress.Loopback), "KnownProxies contains 127.0.0.1");
            Assert(options1.KnownProxies.Contains(IPAddress.IPv6Loopback), "KnownProxies contains ::1");
            Assert(options1.ForwardLimit == 1, "ForwardLimit defaults to 1");
        }

        // 3. Options and DI registration with forwardLimit = 2
        var services2 = new ServiceCollection();
        services2.AddTrustedForwardedHeaders(forwardLimit: 2);
        using (var sp2 = services2.BuildServiceProvider())
        {
            var options2 = sp2.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
            Assert(options2.ForwardLimit == 2, "ForwardLimit configured to 2");
        }

        // 4. Middleware execution: trusted remote proxy updates RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.195";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("203.0.113.195")),
                "Trusted loopback proxy updates RemoteIpAddress to forwarded client IP");
            Assert(context.Request.Scheme == "https", "Trusted loopback proxy updates Request.Scheme to https");
        }

        // 5. Middleware execution: trusted private network proxy updates RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("10.50.1.2");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.42";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.42")),
                "Trusted 10.0.0.0/8 network proxy updates RemoteIpAddress");
            Assert(context.Request.Scheme == "https", "Trusted 10.0.0.0/8 network proxy updates Scheme");
        }

        // 6. Middleware execution: untrusted remote proxy retains original RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            var untrustedIp = IPAddress.Parse("203.0.113.50");
            context.Connection.RemoteIpAddress = untrustedIp;
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "1.2.3.4";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(untrustedIp),
                "Untrusted remote IP does not update RemoteIpAddress");
            Assert(context.Request.Scheme == "http", "Untrusted remote IP does not update Scheme");
        }

        // 7. Middleware execution: IPv4-mapped IPv6 trusted proxy (::ffff:127.0.0.1)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("::ffff:127.0.0.1");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.77";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.77")),
                "IPv4-mapped IPv6 loopback is recognized as trusted proxy");
            Assert(context.Request.Scheme == "https", "Scheme updated for IPv4-mapped IPv6 loopback");
        }

        // 8. Middleware execution: IPv4-mapped IPv6 trusted network (::ffff:10.10.10.10)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("::ffff:10.10.10.10");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.88";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.88")),
                "IPv4-mapped IPv6 in 10.0.0.0/8 is recognized as trusted proxy");
            Assert(context.Request.Scheme == "https", "Scheme updated for IPv4-mapped IPv6 private network");
        }

        // 9. Middleware execution: multi-hop with forwardLimit = 1 (stops after 1 hop)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("10.0.0.2")),
                "forwardLimit=1 stops after 1 hop, resulting in 10.0.0.2");
        }

        // 10. Middleware execution: multi-hop with forwardLimit = 2 (traverses trusted hop to client)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 2);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("203.0.113.1")),
                "forwardLimit=2 consumes trusted hop 10.0.0.2 and sets client IP 203.0.113.1");
        }

        // 11. Middleware execution: multi-hop does not exceed forwardLimit = 2 when 3 hops exist
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 192.168.1.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 2);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("192.168.1.1")),
                "forwardLimit=2 consumes exactly 2 hops (10.0.0.2 then 192.168.1.1) and stops");
        }

        // 12. Service discovery with AddServiceDefaults
        {
            var responderBuilder = WebApplication.CreateBuilder();
            responderBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            var responder = responderBuilder.Build();
            int resolvedRequests = 0;
            responder.MapGet("/probe", () =>
            {
                Interlocked.Increment(ref resolvedRequests);
                return Results.Ok("discovery-probe-ok");
            });
            await responder.StartAsync();
            var responderUrl = responder.Urls.First();

            try
            {
                var clientBuilder = WebApplication.CreateBuilder();
                clientBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
                clientBuilder.Configuration["services:fixture:http:0"] = responderUrl;
                clientBuilder.AddServiceDefaults();
                var clientApp = clientBuilder.Build();
                await clientApp.StartAsync();

                try
                {
                    var factory = clientApp.Services.GetRequiredService<IHttpClientFactory>();
                    using var httpClient = factory.CreateClient();
                    using var resp = await httpClient.GetAsync("http://fixture/probe");
                    Require(resp.IsSuccessStatusCode, "discovery request succeeded");
                    Require(resolvedRequests == 1, "discovery reaches isolated responder");
                }
                finally
                {
                    await clientApp.StopAsync();
                    await clientApp.DisposeAsync();
                }
            }
            finally
            {
                await responder.StopAsync();
                await responder.DisposeAsync();
            }
        }

        // 13. Health and alive endpoints in Development and Production
        foreach (var env in new[] { Environments.Development, Environments.Production })
        {
            var envAppBuilder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = env
            });
            envAppBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            envAppBuilder.AddServiceDefaults();
            var envApp = envAppBuilder.Build();
            envApp.MapDefaultEndpoints();
            await envApp.StartAsync();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(envApp.Urls.First()) };
                using var hResp = await client.GetAsync("/health");
                Require(hResp.StatusCode == HttpStatusCode.OK, $"/health returns 200 in {env}");
                using var aResp = await client.GetAsync("/alive");
                Require(aResp.StatusCode == HttpStatusCode.OK, $"/alive returns 200 in {env}");
            }
            finally
            {
                await envApp.StopAsync();
                await envApp.DisposeAsync();
            }
        }

        // 14. OTLP export: empty/whitespace gating & isolated ephemeral receiver
        {
            // Verify empty/whitespace endpoint gating does not configure exporter or throw
            var noOtlpBuilder = WebApplication.CreateBuilder();
            noOtlpBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            noOtlpBuilder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"] = "   ";
            noOtlpBuilder.AddServiceDefaults();
            var noOtlpApp = noOtlpBuilder.Build();
            await noOtlpApp.StartAsync();
            await noOtlpApp.StopAsync();
            await noOtlpApp.DisposeAsync();

            // Start isolated ephemeral OTLP receiver
            var receiverBuilder = WebApplication.CreateBuilder();
            receiverBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            var receiverApp = receiverBuilder.Build();

            var receivedTraces = new List<byte[]>();
            var receivedMetrics = new List<byte[]>();
            var receivedLogs = new List<byte[]>();
            long metricPayloadBytes = 0;
            long logPayloadBytes = 0;

            receiverApp.MapPost("/v1/traces", async (HttpContext ctx) =>
            {
                using var ms = new MemoryStream();
                await ctx.Request.Body.CopyToAsync(ms);
                var bytes = ms.ToArray();
                lock (receivedTraces) { receivedTraces.Add(bytes); }
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                ctx.Response.ContentType = "application/x-protobuf";
                await ctx.Response.Body.FlushAsync();
            });

            receiverApp.MapPost("/v1/metrics", async (HttpContext ctx) =>
            {
                using var ms = new MemoryStream();
                await ctx.Request.Body.CopyToAsync(ms);
                var bytes = ms.ToArray();
                lock (receivedMetrics) { receivedMetrics.Add(bytes); }
                Interlocked.Add(ref metricPayloadBytes, bytes.Length);
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                ctx.Response.ContentType = "application/x-protobuf";
                await ctx.Response.Body.FlushAsync();
            });

            receiverApp.MapPost("/v1/logs", async (HttpContext ctx) =>
            {
                using var ms = new MemoryStream();
                await ctx.Request.Body.CopyToAsync(ms);
                var bytes = ms.ToArray();
                lock (receivedLogs) { receivedLogs.Add(bytes); }
                Interlocked.Add(ref logPayloadBytes, bytes.Length);
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                ctx.Response.ContentType = "application/x-protobuf";
                await ctx.Response.Body.FlushAsync();
            });

            await receiverApp.StartAsync();
            var receiverUrl = receiverApp.Urls.First();

            try
            {
                var testProcessor = new TestActivityProcessor();
                var otlpAppBuilder = WebApplication.CreateBuilder(new WebApplicationOptions
                {
                    EnvironmentName = Environments.Production
                });
                otlpAppBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
                otlpAppBuilder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"] = receiverUrl;
                otlpAppBuilder.Configuration["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf";
                otlpAppBuilder.Configuration["OTEL_BLRP_SCHEDULE_DELAY"] = "100";
                otlpAppBuilder.Configuration["OTEL_BSP_SCHEDULE_DELAY"] = "100";
                otlpAppBuilder.Configuration["OTEL_METRIC_EXPORT_INTERVAL"] = "100";

                otlpAppBuilder.AddServiceDefaults();
                otlpAppBuilder.Services.AddOpenTelemetry().WithTracing(t => t.AddProcessor(testProcessor));

                var otlpApp = otlpAppBuilder.Build();
                otlpApp.MapDefaultEndpoints();
                await otlpApp.StartAsync();

                string expectedTraceId;
                string expectedSpanId;
                const string marker = "platform-characterization-span";

                try
                {
                    // 1. Call /health and /alive to check span filtering
                    using (var client = new HttpClient { BaseAddress = new Uri(otlpApp.Urls.First()) })
                    {
                        var hResp = await client.GetAsync("/health");
                        Require(hResp.IsSuccessStatusCode, "health returned 200");
                        var aResp = await client.GetAsync("/alive");
                        Require(aResp.IsSuccessStatusCode, "alive returned 200");
                    }

                    // 2. Emit activity fixture
                    using (var source = new ActivitySource(otlpApp.Environment.ApplicationName))
                    using (var act = source.StartActivity(marker))
                    {
                        Require(act != null, "fixture activity created");
                        expectedTraceId = act!.TraceId.ToHexString();
                        expectedSpanId = act!.SpanId.ToHexString();
                    }

                    // 3. Emit log fixture
                    var logger = otlpApp.Services.GetRequiredService<ILoggerFactory>().CreateLogger("PlatformFixtureLogger");
                    logger.LogInformation("platform fixture log record for otlp export");

                    // 4. Emit meter fixture
                    using (var meter = new Meter(otlpApp.Environment.ApplicationName))
                    {
                        var counter = meter.CreateCounter<long>("platform.fixture.counter");
                        counter.Add(100);
                    }

                    // 5. ForceFlush providers
                    var tracerProvider = otlpApp.Services.GetRequiredService<TracerProvider>();
                    tracerProvider.ForceFlush(10000);

                    var meterProvider = otlpApp.Services.GetRequiredService<MeterProvider>();
                    meterProvider.ForceFlush(10000);
                }
                finally
                {
                    await otlpApp.StopAsync();
                    await otlpApp.DisposeAsync();
                }

                // Bounded wait for receiver to receive payloads
                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(5) && (receivedTraces.Count == 0 || metricPayloadBytes == 0 || logPayloadBytes == 0))
                {
                    await Task.Delay(50);
                }

                // Parse trace payloads using CodedInputStream
                var allSpans = new List<OtlpSpanRecord>();
                lock (receivedTraces)
                {
                    foreach (var traceBytes in receivedTraces)
                    {
                        allSpans.AddRange(ParseOtlpTracePayload(traceBytes));
                    }
                }

                bool traceIdMatched = allSpans.Any(s => string.Equals(Convert.ToHexString(s.TraceId), expectedTraceId, StringComparison.OrdinalIgnoreCase));
                bool spanIdMatched = allSpans.Any(s => string.Equals(Convert.ToHexString(s.SpanId), expectedSpanId, StringComparison.OrdinalIgnoreCase));
                bool markerMatched = allSpans.Any(s => s.Name == marker);

                bool healthSpanObserved = testProcessor.ProcessedActivities.Any(a =>
                    a.DisplayName.Contains("/health", StringComparison.OrdinalIgnoreCase) ||
                    a.GetTagItem("url.path")?.ToString()?.Contains("/health") == true ||
                    a.GetTagItem("http.target")?.ToString()?.Contains("/health") == true);

                bool aliveSpanObserved = testProcessor.ProcessedActivities.Any(a =>
                    a.DisplayName.Contains("/alive", StringComparison.OrdinalIgnoreCase) ||
                    a.GetTagItem("url.path")?.ToString()?.Contains("/alive") == true ||
                    a.GetTagItem("http.target")?.ToString()?.Contains("/alive") == true);

                Require(traceIdMatched && spanIdMatched && markerMatched, "OTLP span delivered");
                Require(metricPayloadBytes > 0 && logPayloadBytes > 0, "metrics and logs delivered");
                Require(!healthSpanObserved && !aliveSpanObserved, "health traces excluded");
            }
            finally
            {
                await receiverApp.StopAsync();
                await receiverApp.DisposeAsync();
            }
        }

        // 15. Upstream standard resilience and cancellation
        {
            var resilienceResponderBuilder = WebApplication.CreateBuilder();
            resilienceResponderBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            var resilienceResponder = resilienceResponderBuilder.Build();

            int resilience503Attempts = 0;
            resilienceResponder.MapGet("/resilience-503-probe", () =>
            {
                var attempt = Interlocked.Increment(ref resilience503Attempts);
                if (attempt == 1)
                {
                    return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
                }
                return Results.Ok("recovered-from-503");
            });

            var cancelReceivedTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var cancelObservedTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            int cancelAttempts = 0;
            int lateRequests = 0;
            bool cancellationObserved = false;

            resilienceResponder.MapGet("/resilience-cancel-probe", async (HttpContext ctx) =>
            {
                var attempt = Interlocked.Increment(ref cancelAttempts);
                if (attempt == 1)
                {
                    cancelReceivedTcs.TrySetResult(true);
                    try
                    {
                        await Task.Delay(15000, ctx.RequestAborted);
                    }
                    catch (OperationCanceledException)
                    {
                        cancellationObserved = true;
                        cancelObservedTcs.TrySetResult(true);
                    }
                }
                else
                {
                    Interlocked.Increment(ref lateRequests);
                }
            });

            await resilienceResponder.StartAsync();
            var responderBaseUrl = resilienceResponder.Urls.First();

            try
            {
                var clientAppBuilder = WebApplication.CreateBuilder();
                clientAppBuilder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
                clientAppBuilder.AddServiceDefaults();
                var clientApp = clientAppBuilder.Build();
                await clientApp.StartAsync();

                try
                {
                    var factory = clientApp.Services.GetRequiredService<IHttpClientFactory>();
                    using var client = factory.CreateClient();

                    // Case A: 503 then 200
                    using var resp503 = await client.GetAsync($"{responderBaseUrl}/resilience-503-probe");
                    Require(resp503.StatusCode == HttpStatusCode.OK, "standard resilience recovered from 503");
                    Console.WriteLine($"Standard resilience 503-then-200 attempts: {resilience503Attempts}");
                    Require(resilience503Attempts == 2, $"standard resilience retried 503 (expected 2 attempts, got {resilience503Attempts})");

                    // Case B: Cancellation propagation
                    using var cts = new CancellationTokenSource();
                    var cancelTask = client.GetAsync($"{responderBaseUrl}/resilience-cancel-probe", cts.Token);

                    var serverStarted = await Task.WhenAny(cancelReceivedTcs.Task, Task.Delay(5000));
                    Require(serverStarted == cancelReceivedTcs.Task, "resilience-cancel-probe reached server");

                    cts.Cancel();

                    try
                    {
                        await cancelTask;
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected on client
                    }

                    var observedInTime = await Task.WhenAny(cancelObservedTcs.Task, Task.Delay(5000));
                    Require(observedInTime == cancelObservedTcs.Task, "upstream cancellation observed by server");

                    var swDrain = Stopwatch.StartNew();
                    while (swDrain.Elapsed < TimeSpan.FromSeconds(2))
                    {
                        await Task.Delay(50);
                    }

                    Require(cancellationObserved && lateRequests == 0, "cancel and drain bounded");
                }
                finally
                {
                    await clientApp.StopAsync();
                    await clientApp.DisposeAsync();
                }
            }
            finally
            {
                await resilienceResponder.StopAsync();
                await resilienceResponder.DisposeAsync();
            }
        }

        Console.WriteLine("All PlatformChecks passed.");
    }
}
