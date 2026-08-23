import { describe, expect, it } from "vitest"

import {
  normalizeAuditLogDetail,
  normalizeComboboxOption,
  normalizeMenuDetail,
  normalizeRoleDetail,
  normalizeSystemGroup,
  normalizeSystemGroupDetail,
  normalizeUserDetail,
} from "./admin-normalizers"

describe("admin normalizers", () => {
  it("preserves user password and folder upload values in detail payloads", () => {
    expect(
      normalizeUserDetail({
        Id: "user-1",
        Username: "admin",
        Fullname: "System Admin",
        Password: "placeholder-token",
        RoleId: "role-1",
        RoleName: "Administrator",
        Email: "admin@example.test",
        Avatar: "/avatars/admin.png",
        FolderUpload: "folder-user-1",
      }),
    ).toMatchObject({
      id: "user-1",
      username: "admin",
      fullname: "System Admin",
      password: "placeholder-token",
      folderUpload: "folder-user-1",
      avatar: "/avatars/admin.png",
    })
  })

  it("normalizes system groups with parent labels and nullable ids", () => {
    expect(
      normalizeSystemGroup({
        id: "group-1",
        name: "Identity",
        parentId: null,
        parent: "System",
        sort: 10,
        createdAt: "2026-05-12T00:00:00Z",
      }),
    ).toMatchObject({
      id: "group-1",
      name: "Identity",
      parentId: null,
      parent: "System",
      sort: 10,
    })
  })

  it("normalizes system group detail payloads with casing tolerance", () => {
    expect(
      normalizeSystemGroupDetail({
        Id: "group-2",
        Name: "Menus",
        ParentId: "group-1",
        Parent: "Identity",
        IsActived: false,
        FolderUpload: "group-folder",
      }),
    ).toMatchObject({
      id: "group-2",
      name: "Menus",
      parentId: "group-1",
      parent: "Identity",
      isActived: false,
      folderUpload: "group-folder",
    })
  })

  it("normalizes combobox options from backend text/value records", () => {
    expect(
      normalizeComboboxOption({
        Text: "Identity",
        Value: "group-1",
        Sort: 10,
        Parent: "system",
        IsSelected: true,
      }),
    ).toEqual({
      label: "Identity",
      value: "group-1",
      sort: 10,
      parent: "system",
      isSelected: true,
    })
  })

  it("tolerates nullable and casing mixed detail payloads", () => {
    expect(
      normalizeRoleDetail({
        id: "role-1",
        name: "Administrator",
        folderUpload: null,
      }),
    ).toMatchObject({
      id: "role-1",
      name: "Administrator",
      folderUpload: "",
    })

    expect(
      normalizeMenuDetail({
        ID: "menu-1",
         Controller: "User",
         Name: "Users",
         PermissionKey: "admin.users",
         SystemGroupId: "group-1",

        Sort: 10,
        CanView: true,
        CanAdd: false,
        CanUpdate: false,
        CanDelete: false,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
      } as never),
    ).toMatchObject({
      id: "",
      name: "Users",
      controller: "User",
      sort: 10,
    })

    expect(
      normalizeAuditLogDetail({
        Id: "audit-1",
        UserId: "user-1",
        UserName: "admin",
        Action: "LOGIN",
        EntityName: "Auth",
        IsSuccess: true,
        CreatedAt: "2026-05-12T00:00:00Z",
      }),
    ).toMatchObject({
      id: "audit-1",
      userName: "admin",
      isSuccess: true,
      createdAt: "2026-05-12T00:00:00Z",
    })
  })
})
