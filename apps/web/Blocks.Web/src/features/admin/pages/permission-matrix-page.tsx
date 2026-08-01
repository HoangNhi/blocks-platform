import { Save } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"

import { SystemListPageScaffold } from "../components/system-list-page-scaffold"
import { createSystemAdminApi } from "../system-admin-api"
import type { PermissionGroupModel, RoleModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

const permissionColumns = [
  { key: "isViewed", header: "Xem" },
  { key: "isAdded", header: "Thêm" },
  { key: "isUpdated", header: "Cập nhật" },
  { key: "isDeleted", header: "Xóa" },
  { key: "isApproved", header: "Duyệt" },
  { key: "isAnalyzed", header: "Thống kê" },
] as const

type PermissionKey = (typeof permissionColumns)[number]["key"]

function getInitialSelectedRoleId(roles: RoleModel[], requestedRoleId: string) {
  if (requestedRoleId && roles.some((role) => role.id === requestedRoleId)) {
    return requestedRoleId
  }

  return roles[0]?.id ?? ""
}
function countDirtyPermissionRows(
  current: PermissionGroupModel[],
  baseline: PermissionGroupModel[],
) {
  const baselineByMenuId = new Map(
    baseline.flatMap((group) => group.roles).map((permission) => [permission.menuId, permission]),
  )

  let dirtyRows = 0

  for (const group of current) {
    for (const permission of group.roles) {
      const previous = baselineByMenuId.get(permission.menuId)
      if (!previous) continue

      const changed = permissionColumns.some(
        (column) => permission[column.key] !== previous[column.key],
      )

      if (changed) {
        dirtyRows += 1
      }
    }
  }

  return dirtyRows
}

export function PermissionMatrixPage() {
  const [searchParams] = useSearchParams()
  const requestedRoleId = searchParams.get("roleId") ?? ""
  const [roles, setRoles] = useState<RoleModel[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [groups, setGroups] = useState<PermissionGroupModel[]>([])
  const [baselineGroups, setBaselineGroups] = useState<PermissionGroupModel[]>([])
  const [permissionsReloadKey, setPermissionsReloadKey] = useState(0)
  const [isRolesLoading, setIsRolesLoading] = useState(true)
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const isLoading = isRolesLoading || (Boolean(selectedRoleId) && isPermissionsLoading)
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null
  const dirtyRows = useMemo(
    () => countDirtyPermissionRows(groups, baselineGroups),
    [baselineGroups, groups],
  )

  const loadRoles = useCallback(
    () => adminApi.getRoles({ pageIndex: 1, pageSize: 100, textSearch: "" }),
    [],
  )

  const loadPermissionsByRole = useCallback(
    (roleId: string) => adminApi.getPermissionsByRole(roleId),
    [],
  )

  useEffect(() => {
    let active = true

    void loadRoles()
      .then((result) => {
        if (!active) return
        setRoles(result.data)
        setSelectedRoleId(getInitialSelectedRoleId(result.data, requestedRoleId))
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Roles failed to load.")
      })
      .finally(() => {
        if (!active) return
        setIsRolesLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadRoles, requestedRoleId])

  useEffect(() => {
    if (!selectedRoleId) return

    let active = true

    void loadPermissionsByRole(selectedRoleId)
      .then((result) => {
        if (!active) return
        setGroups(result)
        setBaselineGroups(result)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(
          loadError instanceof Error ? loadError.message : "Permissions failed to load.",
        )
      })
      .finally(() => {
        if (!active) return
        setIsPermissionsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadPermissionsByRole, permissionsReloadKey, selectedRoleId])

  const filteredRows = useMemo(
    () =>
      groups.flatMap((group) =>
        group.roles
          .filter(
            (permission) =>
              permission.name?.toLowerCase().includes(search.trim().toLowerCase()) ??
              true,
          )
          .map((permission) => ({
            groupName: group.systemGroup,
            permission,
          })),
      ),
    [groups, search],
  )

  function setPermission(menuId: string, key: PermissionKey, value: boolean) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        roles: group.roles.map((permission) =>
          permission.menuId === menuId ? { ...permission, [key]: value } : permission,
        ),
      })),
    )
  }

  async function savePermissions() {
    if (!selectedRoleId || isSaving) return

    setError(null)
    setIsSaving(true)

    try {
      const permissions = groups.flatMap((group) => group.roles)
      const result = await adminApi.updatePermissions(permissions)

      if (result !== true) {
        throw new Error("Permission changes were not confirmed by the server.")
      }

      const refreshed = await loadPermissionsByRole(selectedRoleId)
      setGroups(refreshed)
      setBaselineGroups(refreshed)
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save permissions.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SystemListPageScaffold
      onResetFilters={() => {
        setSearch("")
        const firstRoleId = roles[0]?.id ?? ""

        if (!firstRoleId) {
          setError(null)
          return
        }

        if (selectedRoleId === firstRoleId) {
          setError(null)
          setIsPermissionsLoading(true)
          setPermissionsReloadKey((current) => current + 1)
          return
        }

        setError(null)
        setIsPermissionsLoading(true)
        setSelectedRoleId(firstRoleId)
      }}
      filterContent={
        <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_minmax(0,360px)]">
          <Select
            value={selectedRoleId}
            onValueChange={(value) => {
              setError(null)
              setIsPermissionsLoading(true)
              setSelectedRoleId(value)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn vai trò" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            placeholder="Tìm kiếm menu..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      }
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              Vai trò: {selectedRole?.name ?? "Chưa chọn"}
            </Badge>
            <Badge variant={dirtyRows > 0 ? "default" : "secondary"}>
              {dirtyRows > 0
                ? `${dirtyRows} thay đổi chưa lưu`
                : "Không có thay đổi"}
            </Badge>
            {isLoading ? <Badge variant="outline">Đang tải</Badge> : null}
            {isSaving ? <Badge variant="outline">Đang lưu</Badge> : null}
          </div>
          <Button
            type="button"
            onClick={() => void savePermissions()}
            disabled={!selectedRoleId || isSaving || isLoading}
          >
            <Save className="size-4" aria-hidden="true" />
            {isSaving ? "Đang lưu..." : "Lưu phân quyền"}
          </Button>
        </div>
      }
      tableContent={
        <Card className="overflow-hidden border-platform-border shadow-sm">
          <CardContent className="p-0">
            {error ? (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertTitle>Không thể tải quyền</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên gọi</TableHead>
                      <TableHead>Nhóm quyền</TableHead>
                      {permissionColumns.map((column) => (
                        <TableHead key={column.key} className="text-center">
                          {column.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, index) => (
                        <TableRow key={`permission-skeleton-${index}`}>
                          <TableCell>
                            <Skeleton className="h-4 w-full max-w-[220px]" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full max-w-[180px]" />
                          </TableCell>
                          {permissionColumns.map((column) => (
                            <TableCell key={`${column.key}-${index}`} className="text-center">
                              <Skeleton className="mx-auto h-4 w-4" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={permissionColumns.length + 2}
                          className="py-10 text-center text-sm text-platform-muted"
                        >
                          Không có quyền phù hợp với bộ lọc hiện tại.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map(({ groupName, permission }) => (
                        <TableRow key={permission.menuId}>
                          <TableCell>
                            <span className="font-medium">
                              {permission.name ?? permission.menuId}
                            </span>
                          </TableCell>
                          <TableCell>{groupName}</TableCell>
                          {permissionColumns.map((column) => (
                            <TableCell
                              key={`${permission.menuId}-${column.key}`}
                              className="text-center"
                            >
                              <Checkbox
                                checked={permission[column.key]}
                                onCheckedChange={(checked) =>
                                  setPermission(
                                    permission.menuId,
                                    column.key,
                                    checked === true,
                                  )
                                }
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      }
    />
  )
}
