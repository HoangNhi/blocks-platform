using System.Text.Json;
using Blocks.Shared.Common;
using Blocks.SystemService.Protos;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Polly;

namespace Blocks.CatalogService.Infrastructure.Interceptors;

public class AuditInterceptor : SaveChangesInterceptor
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly AuditProto.AuditProtoClient _auditClient;
    private readonly ILogger<AuditInterceptor> _logger;

    private static readonly HashSet<string> ExcludedProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password", "PasswordSalt", "Token", "RefreshToken"
    };

    // Key used to pass the captured audit payload from SavingChanges → SavedChanges
    private const string AuditPayloadKey = "AuditInterceptorPayload_Catalog";

    public AuditInterceptor(
        IHttpContextAccessor httpContextAccessor,
        AuditProto.AuditProtoClient auditClient,
        ILogger<AuditInterceptor> logger)
    {
        _httpContextAccessor = httpContextAccessor;
        _auditClient = auditClient;
        _logger = logger;
    }

    // Phase 1: Capture old/new values BEFORE save (ChangeTracker still has state here)
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context == null)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        var httpContext = _httpContextAccessor.HttpContext;

        var entries = eventData.Context.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        if (entries.Count == 0)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        var contextualAction = httpContext?.Items["AuditAction"]?.ToString();
        var action = contextualAction ?? InferAction(entries);

        var oldValuesGroup = new Dictionary<string, List<Dictionary<string, object?>>>();
        var newValuesGroup = new Dictionary<string, List<Dictionary<string, object?>>>();

        foreach (var entry in entries)
        {
            var entityName = entry.Entity.GetType().Name;
            switch (entry.State)
            {
                case EntityState.Added:
                    AddToGroup(newValuesGroup, entityName, SerializeEntryValues(entry.CurrentValues));
                    break;
                case EntityState.Modified:
                    AddToGroup(oldValuesGroup, entityName, SerializeModifiedOriginal(entry));
                    AddToGroup(newValuesGroup, entityName, SerializeModifiedCurrent(entry));
                    break;
                case EntityState.Deleted:
                    AddToGroup(oldValuesGroup, entityName, SerializeEntryValues(entry.OriginalValues));
                    break;
            }
        }

        var controllerName = GetControllerName(httpContext) ?? entries.First().Entity.GetType().Name;

        // Build and store the payload — will be sent AFTER commit succeeds
        var payload = new WriteAuditLogRequest
        {
            UserId = httpContext?.User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value ?? "",
            UserName = httpContext?.User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "System",
            Action = action,
            EntityName = controllerName,
            EntityId = GetEntityId(entries.First()),
            OldValues = oldValuesGroup.Count > 0 ? JsonSerializer.Serialize(oldValuesGroup) : "",
            NewValues = newValuesGroup.Count > 0 ? JsonSerializer.Serialize(newValuesGroup) : "",
            IpAddress = httpContext?.GetClientIp() ?? "",
            ServiceName = "CatalogService",
            IsSuccess = true,
            ErrorMessage = ""
        };

        if (httpContext != null)
            httpContext.Items[AuditPayloadKey] = payload;

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    // Phase 2: Send audit log AFTER commit succeeds (no false positives on DB failure)
    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        var httpContext = _httpContextAccessor.HttpContext;

        if (httpContext?.Items[AuditPayloadKey] is WriteAuditLogRequest payload)
        {
            // Clear payload immediately to avoid double-send if SavedChanges fires multiple times
            httpContext.Items.Remove(AuditPayloadKey);

            var capturedPayload = payload;
            var capturedLogger = _logger;
            var capturedClient = _auditClient;

            _ = Task.Run(async () =>
            {
                var retryPolicy = Policy
                    .Handle<RpcException>()
                    .WaitAndRetryAsync(
                        3,
                        attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                        (ex, ts, attempt, _) => capturedLogger.LogWarning(ex,
                            "Audit gRPC retry {Attempt}/3 for {Service}/{Action}",
                            attempt, capturedPayload.ServiceName, capturedPayload.Action));

                try
                {
                    await retryPolicy.ExecuteAsync(() =>
                        capturedClient.WriteAuditLogAsync(capturedPayload).ResponseAsync);
                }
                catch (Exception ex)
                {
                    capturedLogger.LogError(ex,
                        "AUDIT LOG LOST after 3 retries for {Service}/{Action}/{Entity}",
                        capturedPayload.ServiceName, capturedPayload.Action, capturedPayload.EntityName);
                }
            }, CancellationToken.None);
        }

        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private static string InferAction(List<EntityEntry> entries)
    {
        var states = entries.Select(e => e.State).Distinct().ToList();
        if (states.Count == 1)
        {
            return states[0] switch
            {
                EntityState.Added => "CREATE",
                EntityState.Modified => "UPDATE",
                EntityState.Deleted => "DELETE",
                _ => "UNKNOWN"
            };
        }
        return "UPDATE";
    }

    private static string? GetControllerName(HttpContext? httpContext)
    {
        if (httpContext == null) return null;
        var segments = httpContext.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments != null && segments.Length >= 2)
            return segments[1];
        return null;
    }

    private static void AddToGroup(Dictionary<string, List<Dictionary<string, object?>>> group, string entityName, Dictionary<string, object?> values)
    {
        if (values.Count == 0) return;
        if (!group.ContainsKey(entityName))
            group[entityName] = new List<Dictionary<string, object?>>();
        group[entityName].Add(values);
    }

    private static string GetEntityId(EntityEntry entry)
    {
        var keys = entry.Metadata.FindPrimaryKey()?.Properties;
        if (keys == null) return "";
        return string.Join(",", keys.Select(p => entry.Property(p.Name).CurrentValue?.ToString() ?? ""));
    }

    private static Dictionary<string, object?> SerializeEntryValues(PropertyValues values)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var p in values.Properties)
        {
            if (ExcludedProperties.Contains(p.Name)) continue;
            dict[p.Name] = values[p];
        }
        return dict;
    }

    private static Dictionary<string, object?> SerializeModifiedOriginal(EntityEntry entry)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var p in entry.Properties.Where(p => p.IsModified))
        {
            if (ExcludedProperties.Contains(p.Metadata.Name)) continue;
            dict[p.Metadata.Name] = p.OriginalValue;
        }
        return dict;
    }

    private static Dictionary<string, object?> SerializeModifiedCurrent(EntityEntry entry)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var p in entry.Properties.Where(p => p.IsModified))
        {
            if (ExcludedProperties.Contains(p.Metadata.Name)) continue;
            dict[p.Metadata.Name] = p.CurrentValue;
        }
        return dict;
    }
}
