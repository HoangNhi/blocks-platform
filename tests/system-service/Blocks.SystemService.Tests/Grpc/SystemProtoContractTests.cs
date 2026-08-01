using Blocks.SystemService.Contracts.Grpc;
using Xunit;

namespace Blocks.SystemService.Tests.Grpc;

public class SystemProtoContractTests
{
    [Fact]
    public void UserSummary_keeps_lookup_projection_fields()
    {
        var summary = new UserSummary
        {
            Id = "user-id",
            Fullname = "Demo User",
            Avatar = "avatar.png",
            Username = "demo",
            IsActived = true,
            Email = "demo@example.test"
        };

        Assert.Equal("user-id", summary.Id);
        Assert.Equal("Demo User", summary.Fullname);
        Assert.Equal("avatar.png", summary.Avatar);
        Assert.Equal("demo", summary.Username);
        Assert.True(summary.IsActived);
        Assert.Equal("demo@example.test", summary.Email);
    }
}
