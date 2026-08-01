using System.Text.Json;
using Blocks.Shared.Common;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Blocks.SystemService.Infrastructure.Interceptors;

public class AuditInterceptor : SaveChangesInterceptor
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    private static readonly HashSet<string> ExcludedProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password", "PasswordSalt", "Token", "RefreshToken"
    };

    public AuditInterceptor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not SystemContext context)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var httpContext = _httpContextAccessor.HttpContext;

        var entries = context.ChangeTracker.Entries()
            .Where(e => e.Entity is not AuditLog &&
                        e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        if (entries.Count == 0)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var contextualAction = httpContext?.Items["AuditAction"]?.ToString();

        // Determine action: contextual > infer from entity states
        var action = contextualAction ?? InferAction(entries);

        // Build grouped OldValues and NewValues
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

        // EntityName = controller name from request path, or first entity type
        var controllerName = GetControllerName(httpContext) ?? entries.First().Entity.GetType().Name;

        var userId = ResolveAuditUserId(httpContext);
        if (!userId.HasValue)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var auditLog = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            UserName = GetUserName(httpContext),
            Action = action,
            EntityName = controllerName,
            EntityId = GetEntityId(entries.First()),
            OldValues = oldValuesGroup.Count > 0 ? JsonSerializer.Serialize(oldValuesGroup) : null,
            NewValues = newValuesGroup.Count > 0 ? JsonSerializer.Serialize(newValuesGroup) : null,
            IpAddress = httpContext?.GetClientIp(),
            ServiceName = "SystemService",
            IsSuccess = true,
            ErrorMessage = null,
            CreatedAt = DateTime.UtcNow
        };

        context.AuditLogs.Add(auditLog);

        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static Guid? ResolveAuditUserId(HttpContext? httpContext)
    {
        var claim = httpContext?.User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value;
        if (!Guid.TryParse(claim, out var userId))
            return null;

        return userId == Guid.Empty ? null : userId;
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
        // Mixed states — likely an update with child add/delete
        return "UPDATE";
    }

    private static string? GetControllerName(HttpContext? httpContext)
    {
        if (httpContext == null) return null;
        // Path format: /api/ControllerName/action-name
        var segments = httpContext.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments != null && segments.Length >= 2)
            return segments[1]; // "api" is [0], controller is [1]
        return null;
    }

    private static void AddToGroup(Dictionary<string, List<Dictionary<string, object?>>> group, string entityName, Dictionary<string, object?> values)
    {
        if (values.Count == 0) return;
        if (!group.ContainsKey(entityName))
            group[entityName] = new List<Dictionary<string, object?>>();
        group[entityName].Add(values);
    }

    private static string GetUserName(HttpContext? httpContext)
    {
        return httpContext?.User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "System";
    }

    private static string? GetEntityId(EntityEntry entry)
    {
        var keys = entry.Metadata.FindPrimaryKey()?.Properties;
        if (keys == null || !keys.Any()) return null;
        return string.Join(",", keys.Select(p => entry.Property(p.Name).CurrentValue?.ToString()).Where(v => v != null));
    }

    private static Dictionary<string, object?> SerializeEntryValues(PropertyValues values)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var prop in values.Properties)
        {
            if (ExcludedProperties.Contains(prop.Name)) continue;
            dict[prop.Name] = values[prop];
        }
        return dict;
    }

    private static Dictionary<string, object?> SerializeModifiedOriginal(EntityEntry entry)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var prop in entry.Properties.Where(p => p.IsModified))
        {
            if (ExcludedProperties.Contains(prop.Metadata.Name)) continue;
            dict[prop.Metadata.Name] = prop.OriginalValue;
        }
        return dict;
    }

    private static Dictionary<string, object?> SerializeModifiedCurrent(EntityEntry entry)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var prop in entry.Properties.Where(p => p.IsModified))
        {
            if (ExcludedProperties.Contains(prop.Metadata.Name)) continue;
            dict[prop.Metadata.Name] = prop.CurrentValue;
        }
        return dict;
    }
}
