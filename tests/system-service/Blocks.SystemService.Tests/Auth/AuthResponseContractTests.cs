using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Xunit;

namespace Blocks.SystemService.Tests.Auth;

public class AuthResponseContractTests
{
    [Fact]
    public void LoginResponse_does_not_expose_password_fields()
    {
        var properties = typeof(LoginResponse).GetProperties();

        Assert.False(typeof(ModelUser).IsAssignableFrom(typeof(LoginResponse)));
        Assert.DoesNotContain(properties, property =>
            property.Name.Contains("Password", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ModelAuthenticatedUser_from_model_user_omits_password_fields()
    {
        var source = new ModelUser
        {
            Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            Username = "admin",
            Fullname = "Admin User",
            Password = "hashed-password",
            RoleId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            RoleName = "Administrator",
            Email = "admin@example.test",
            Avatar = "/avatar.png"
        };

        var result = ModelAuthenticatedUser.FromModelUser(source);
        var properties = result.GetType().GetProperties();

        Assert.Equal(source.Id, result.Id);
        Assert.Equal(source.Username, result.Username);
        Assert.Equal(source.Fullname, result.Fullname);
        Assert.Equal(source.RoleId, result.RoleId);
        Assert.Equal(source.RoleName, result.RoleName);
        Assert.Equal(source.Email, result.Email);
        Assert.Equal(source.Avatar, result.Avatar);
        Assert.DoesNotContain(properties, property =>
            property.Name.Contains("Password", StringComparison.OrdinalIgnoreCase));
    }
}
