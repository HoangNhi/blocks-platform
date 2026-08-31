using AutoMapper;
using Blocks.Shared.Authorization;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.Commons.UploadFile;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Blocks.SystemService.Services.CoreFeature.User;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public sealed class UserServiceAvatarTests
{
    [Fact]
    public async Task Update_without_upload_folder_skips_avatar_rpc_and_preserves_avatar()
    {
        var roleId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var avatar = "System/Avatar/current.png";

        await using var context = new SystemContext(
            new DbContextOptionsBuilder<SystemContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);

        context.Roles.Add(new Role
        {
            Id = roleId,
            Name = "Administrator",
            Key = "administrator",
            CreatedBy = "test",
            IsActived = true,
            IsDeleted = false,
        });
        context.Users.Add(new User
        {
            Id = userId,
            Username = "admin",
            Fullname = "Admin",
            Email = "admin@example.test",
            Password = "stored-password",
            PasswordSalt = "salt",
            Avatar = avatar,
            RoleId = roleId,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            IsActived = true,
            IsDeleted = false,
        });
        await context.SaveChangesAsync();

        var mapperConfiguration = new MapperConfigurationExpression();
        mapperConfiguration.AddProfile<UserProfile>();
        var mapper = new Mapper(new MapperConfiguration(mapperConfiguration, NullLoggerFactory.Instance));
        var uploadFileService = new RecordingUploadFileService();
        var service = new UserService(
            context,
            mapper,
            new HttpContextAccessor(),
            uploadFileService,
            new ReferenceGuard(context),
            new NoopFunctionalAuthorizationService());

        var result = await service.Update(new UserRequest
        {
            Id = userId,
            Username = "admin",
            Fullname = "Admin Updated",
            Email = "admin@example.test",
            Password = "__BLOCKS_PASSWORD_UNCHANGED__",
            RoleId = roleId,
            Avatar = avatar,
            FolderUpload = string.Empty,
            IsActived = true,
        });

        Assert.Equal(0, uploadFileService.CallCount);
        Assert.Equal(avatar, result.Avatar);
        Assert.Equal(avatar, (await context.Users.FindAsync(userId))!.Avatar);
    }

    private sealed class RecordingUploadFileService : IUploadFileService
    {
        public int CallCount { get; private set; }

        public Task<string> UploadAvatarAsync(string folderUploadId, string? oldImage)
        {
            CallCount++;
            return Task.FromResult("uploaded.png");
        }
    }

    private sealed class ReferenceGuard(SystemContext context) : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default) =>
            context.Roles.Any(role => role.Id == roleId && !role.IsDeleted)
                ? Task.CompletedTask
                : throw new InvalidOperationException("Role not found.");

        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(userId);

        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(null);
    }

    private sealed class NoopFunctionalAuthorizationService : IFunctionalAuthorizationService
    {
        public Task<bool> CheckAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            string? controller = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(false);
    }
}
