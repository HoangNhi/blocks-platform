using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Services.CoreFeature.Role;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public sealed class AdminResponseContractTests
{
    [Fact]
    public void UserListDto_DoesNotInheritSensitiveUserModel()
    {
        Assert.False(typeof(ModelUser).IsAssignableFrom(typeof(ModelUserGetListPaging)));
    }

    [Fact]
    public void UserListDto_DoesNotExposePasswordProperties()
    {
        var properties = typeof(ModelUserGetListPaging).GetProperties();

        Assert.DoesNotContain(properties, property =>
            property.Name.Contains("Password", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task UpdatePermissions_ReturnsServiceResultInData()
    {
        var controller = new RoleController(new FakeRoleService(updatePermissionsResult: true));

        var actionResult = await controller.UpdatePermissions(new UpdatePermissionsRequest
        {
            Permissions = [],
        });

        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var response = Assert.IsType<BaseResponse<bool>>(okResult.Value);

        Assert.True(response.Success);
        Assert.True(response.Data);
    }

    private sealed class FakeRoleService : IRoleService
    {
        private readonly bool _updatePermissionsResult;

        public FakeRoleService(bool updatePermissionsResult)
        {
            _updatePermissionsResult = updatePermissionsResult;
        }

        public Task<ModelRole> GetById(GetByIdRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<ModelRole> Insert(RoleRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<ModelRole> Update(RoleRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<string> DeleteList(DeleteListRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<GetListPagingResponse<ModelRoleGetListPaging>> GetList(GetListPagingRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<List<ModelPermission>> GetPermissionsByRole(GetByIdRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<bool> UpdatePermissions(UpdatePermissionsRequest request)
        {
            return Task.FromResult(_updatePermissionsResult);
        }

        public Task<List<ModelCombobox>> GetAllForCombobox()
        {
            throw new NotImplementedException();
        }

        public Task<List<ModelGetPermissionByUser>> GetPermissionsByUser(GetByIdRequest request)
        {
            throw new NotImplementedException();
        }
    }
}
