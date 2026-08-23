using System.Text.Json;
using Blocks.Shared.Common;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;
using System.Reflection;
using Xunit;

namespace Blocks.SystemService.Tests.Auth;

public sealed class RegistrationEndpointTests
{
    [Fact]
    public void Public_registration_endpoints_are_anonymous_and_use_expected_routes()
    {
        var availability = typeof(AuthController).GetMethod(nameof(AuthController.GetRegistrationAvailability));
        var register = typeof(AuthController).GetMethod(nameof(AuthController.Register));

        Assert.NotNull(availability);
        Assert.NotNull(register);
        Assert.NotEmpty(availability!.GetCustomAttributes(typeof(AllowAnonymousAttribute), true));
        Assert.NotEmpty(register!.GetCustomAttributes(typeof(AllowAnonymousAttribute), true));
        Assert.Equal("registration-availability", availability.GetCustomAttribute<RouteAttribute>()!.Template);
        Assert.Equal("register", register.GetCustomAttribute<RouteAttribute>()!.Template);
    }

    [Fact]
    public void Public_registration_request_contains_no_role_or_workspace_assignment_fields_and_disallows_unknown_json()
    {
        var properties = typeof(RegisterRequest).GetProperties().Select(property => property.Name).ToHashSet();

        Assert.Equal(
            ["Email", "Fullname", "InvitationToken", "Password", "Username"],
            properties.OrderBy(x => x).ToArray());
        Assert.NotNull(typeof(RegisterRequest).GetCustomAttributes(typeof(JsonUnmappedMemberHandlingAttribute), true).SingleOrDefault());
    }

    [Fact]
    public void Unknown_registration_json_properties_are_rejected()
    {
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<RegisterRequest>("{\"Username\":\"member\",\"Email\":\"member@example.test\",\"Fullname\":\"Nguyễn Văn A\",\"Password\":\"mật-khẩu-dài-hơn-12\",\"RoleId\":\"00000000-0000-0000-0000-000000000001\"}"));
    }

    [Theory]
    [InlineData(RegistrationModes.Open, true)]
    [InlineData(RegistrationModes.InviteOnly, true)]
    [InlineData(RegistrationModes.AdminProvisioned, false)]
    [InlineData("unknown", false)]
    public void Registration_mode_availability_is_explicit(string mode, bool expected)
    {
        Assert.Equal(expected, RegistrationService.IsRegistrationModeAvailable(mode));
    }

    [Fact]
    public void Registration_rate_policy_metadata_has_required_defaults()
    {
        var options = new RegistrationOptions();

        Assert.Equal(5, options.RegistrationPermitLimit);
        Assert.Equal(1, options.RegistrationWindowMinutes);
        Assert.Equal(3, options.BootstrapPermitLimit);
        Assert.Equal(1, options.BootstrapWindowMinutes);
        Assert.Equal("registration", RegistrationOptions.RegistrationPolicy);
        Assert.Equal("bootstrap", RegistrationOptions.BootstrapPolicy);
    }

    [Fact]
    public void Registration_admin_endpoints_require_registration_permission()
    {
        var controller = typeof(RegistrationAdminController);
        var methods = controller.GetMethods().Where(method => method.DeclaringType == controller).ToArray();

        Assert.NotEmpty(methods);
        Assert.All(methods, method =>
        {
            var permission = method.GetCustomAttributes(typeof(AttributePermission), true).Cast<AttributePermission>().Single();
            Assert.Equal("admin.registration", permission.PermissionKey);
        });
    }

    [Fact]
    public void Registration_admin_settings_are_read_from_authenticated_settings_route()
    {
        var settings = typeof(RegistrationAdminController).GetMethod("GetSettings");

        Assert.NotNull(settings);
        Assert.Equal("settings", settings!.GetCustomAttribute<HttpGetAttribute>()!.Template);
        var permission = settings.GetCustomAttributes(typeof(AttributePermission), true).Cast<AttributePermission>().Single();
        Assert.Equal(ActionType.VIEW, permission.Action);
    }
}
