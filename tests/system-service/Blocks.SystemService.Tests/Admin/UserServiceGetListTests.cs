using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Services.CoreFeature.User;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public class UserServiceGetListTests
{
    [Fact]
    public async Task GetList_applies_role_and_status_filters_before_paging()
    {
        var roleId = Guid.NewGuid();
        var otherRoleId = Guid.NewGuid();
        var activeUser = CreateUser("active", roleId, true);
        var inactiveUser = CreateUser("inactive", roleId, false);
        var otherRoleUser = CreateUser("other", otherRoleId, false);

        await using var context = new SystemContext(
            new DbContextOptionsBuilder<SystemContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);

        context.Roles.AddRange(
            new Role { Id = roleId, Name = "Administrator", Key = "administrator", CreatedBy = "test", IsActived = true },
            new Role { Id = otherRoleId, Name = "Member", Key = "member", CreatedBy = "test", IsActived = true });
        context.Users.AddRange(activeUser, inactiveUser, otherRoleUser);
        await context.SaveChangesAsync();

        var service = new UserService(context, null!, null!, null!, null!, null!);
        var result = await service.GetList(new UserGetListPagingRequest
        {
            PageIndex = 1,
            PageSize = 1,
            RoleId = roleId,
            IsActived = false,
        });

        Assert.Equal(1, result.TotalRow);
        Assert.Single(result.Data);
        Assert.Equal(inactiveUser.Id, result.Data[0].Id);
        Assert.Equal("Administrator", result.Data[0].RoleName);
    }

    private static User CreateUser(string username, Guid roleId, bool isActived) => new()
    {
        Id = Guid.NewGuid(),
        Username = username,
        Fullname = username,
        Email = $"{username}@example.test",
        Password = "password",
        PasswordSalt = "salt",
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test",
        IsActived = isActived,
        RoleId = roleId,
        IsDeleted = false,
    };
}
