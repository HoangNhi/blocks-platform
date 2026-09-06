import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { filterPermissionGroups, rolePermissionKeys, type RolePermissionKey } from "../role-permission-state"
import type { PermissionGroupModel } from "../types"

const permissionColumns: ReadonlyArray<{ key: RolePermissionKey; label: string; capability: keyof PermissionGroupModel["roles"][number] }> = [
  { key: "isViewed", label: "Xem", capability: "canView" },
  { key: "isAdded", label: "Thêm", capability: "canAdd" },
  { key: "isUpdated", label: "Cập nhật", capability: "canUpdate" },
  { key: "isDeleted", label: "Xóa", capability: "canDelete" },
  { key: "isApproved", label: "Duyệt", capability: "canApprove" },
  { key: "isAnalyzed", label: "Thống kê", capability: "canAnalyze" },
]

type RolePermissionMatrixProps = {
  permissionGroups: PermissionGroupModel[]
  changedCellCount: number
  status?: "idle" | "loading" | "ready" | "error"
  isLoading?: boolean
  error?: string | null
  disabled?: boolean
  onRetry?: () => void
  onPermissionChange?: (menuId: string, key: RolePermissionKey, value: boolean) => void
  onUndo?: () => void
}

type PermissionTableProps = {
  group: PermissionGroupModel
  disabled: boolean
  onPermissionChange?: (menuId: string, key: RolePermissionKey, value: boolean) => void
}

function PermissionTable({ group, disabled, onPermissionChange }: PermissionTableProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="min-w-[812px]" containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 top-0 z-20 min-w-[260px] bg-card">Chức năng</TableHead>
              {permissionColumns.map((column) => (
                <TableHead key={column.key} className="sticky top-0 z-10 min-w-[92px] bg-card text-center">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {group.roles.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={rolePermissionKeys.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                  Nhóm này chưa có quyền.
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody>
              {group.roles.map((permission) => (
                <TableRow key={permission.menuId}>
                  <TableCell className="sticky left-0 z-10 min-w-[260px] bg-card">
                    <div className="font-medium">{permission.name ?? permission.permissionKey ?? "Chức năng chưa đặt tên"}</div>
                    {permission.name && permission.permissionKey ? <div className="text-xs text-muted-foreground">{permission.permissionKey}</div> : null}
                  </TableCell>
                  {permissionColumns.map((column) => {
                    const supported = permission[column.capability] === true
                    const label = column.label + " " + (permission.name ?? permission.permissionKey ?? "chức năng")

                    return (
                      <TableCell key={permission.menuId + "-" + column.key} className="text-center align-middle [&:has([role=checkbox])]:pr-2">
                        <div className="flex min-h-5 items-center justify-center">
                        {supported ? (
                          <Checkbox
                            checked={permission[column.key]}
                            disabled={disabled}
                            onCheckedChange={(checked) => onPermissionChange?.(permission.menuId, column.key, checked === true)}
                            aria-label={label}
                          />
                        ) : (
                          <span className="inline-flex min-h-5 min-w-5 items-center justify-center text-muted-foreground/70" role="img" aria-label={label + " không được hỗ trợ"} title={column.label + " không được hỗ trợ cho chức năng này"}>
                            —
                          </span>
                        )}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  )
}

export function RolePermissionMatrix({
  permissionGroups,
  changedCellCount,
  status,
  isLoading = false,
  error = null,
  disabled = false,
  onRetry,
  onPermissionChange,
  onUndo,
}: RolePermissionMatrixProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [activeGroupName, setActiveGroupName] = useState("")
  const resolvedStatus = status ?? (isLoading ? "loading" : error ? "error" : "ready")
  const filteredPermissionGroups = useMemo(
    () => filterPermissionGroups(permissionGroups, searchTerm),
    [permissionGroups, searchTerm],
  )
  const activeGroup = filteredPermissionGroups.find((group) => group.systemGroup === activeGroupName)
    ?? filteredPermissionGroups[0]
  const activeGroupValue = activeGroup?.systemGroup ?? ""

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={searchTerm}
            placeholder="Tìm chức năng, mã quyền hoặc nhóm..."
            className="pl-9"
            aria-label="Tìm kiếm quyền"
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault()
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={changedCellCount > 0 ? "default" : "secondary"} aria-live="polite">
            {changedCellCount > 0
              ? changedCellCount + " thay đổi chưa lưu"
              : resolvedStatus === "ready"
                ? "Đã đồng bộ"
                : resolvedStatus === "loading"
                  ? "Đang tải"
                  : resolvedStatus === "error"
                    ? "Chưa đồng bộ"
                    : "Chưa tải"}
          </Badge>
          {changedCellCount > 0 && onUndo ? (
            <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={disabled}>
              Hoàn tác
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Không thể tải phân quyền</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            {onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        orientation="vertical"
        value={activeGroupValue}
        onValueChange={setActiveGroupName}
        className="min-h-0 flex-1 flex-row gap-0 overflow-hidden rounded-lg border"
      >
        <TabsList
          variant="line"
          aria-label="Nhóm quyền"
          className="min-h-0 w-48 shrink-0 flex-col items-stretch justify-start gap-1 overflow-y-auto rounded-none border-r bg-muted/20 p-2 sm:w-60"
        >
          {filteredPermissionGroups.length === 0 ? (
            <span className="px-2 py-3 text-xs text-muted-foreground">Không có nhóm quyền phù hợp.</span>
          ) : (
            filteredPermissionGroups.map((group) => (
              <TabsTrigger
                key={group.systemGroup}
                value={group.systemGroup}
                aria-label={group.systemGroup + " " + group.roles.length + " quyền"}
                className="h-auto min-h-11 flex-none justify-between rounded-md border-l-2 border-transparent px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=active]:border-l-primary data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{group.systemGroup}</span>
                <Badge variant={group.systemGroup === activeGroupValue ? "default" : "secondary"} className="ml-2 shrink-0">
                  {group.roles.length}
                </Badge>
              </TabsTrigger>
            ))
          )}
        </TabsList>
        {isLoading ? (
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-6 text-sm text-muted-foreground">
            Đang tải phân quyền...
          </div>
        ) : activeGroup ? (
          <TabsContent value={activeGroup.systemGroup} className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <PermissionTable group={activeGroup} disabled={disabled} onPermissionChange={onPermissionChange} />
          </TabsContent>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-6 text-sm text-muted-foreground">
            Không có quyền phù hợp với bộ lọc hiện tại.
          </div>
        )}
      </Tabs>
    </div>
  )
}
