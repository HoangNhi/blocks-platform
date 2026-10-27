import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AuditLog } from "@/types/auditlog.types";

interface DiffViewerDialogProps {
  log: AuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-blue-100 text-blue-700 border border-blue-200",
  UPDATE: "bg-amber-100 text-amber-700 border border-amber-200",
  DELETE: "bg-red-100 text-red-700 border border-red-200",
  LOGIN: "bg-green-100 text-green-700 border border-green-200",
  LOGOUT: "bg-slate-100 text-slate-600 border border-slate-200",
};

function getActionColor(action: string): string {
  const upper = action.toUpperCase();
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (upper.startsWith(key)) return cls;
  }
  return "bg-gray-100 text-gray-700 border border-gray-200";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tryParse(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function flattenGroup(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const items of Object.values(parsed as object)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && typeof item === "object") Object.assign(result, item);
      }
    }
  }
  return result;
}

function displayValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") {
    const str = JSON.stringify(val);
    return str.length > 60 ? str.slice(0, 60) + "…" : str;
  }
  const str = String(val);
  return str.length > 60 ? str.slice(0, 60) + "…" : str;
}

function fullValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

interface DiffRow {
  key: string;
  oldVal: unknown;
  newVal: unknown;
  changed: boolean;
}

function computeDiff(
  oldFlat: Record<string, unknown>,
  newFlat: Record<string, unknown>,
): DiffRow[] {
  const keys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);
  return [...keys].map((key) => ({
    key,
    oldVal: oldFlat[key],
    newVal: newFlat[key],
    changed:
      JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key]),
  }));
}

function FlatTable({
  flat,
  header,
  headerClass,
}: {
  flat: Record<string, unknown>;
  header: string;
  headerClass: string;
}) {
  const entries = Object.entries(flat);
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className={`px-4 py-2 text-sm font-semibold ${headerClass}`}>
        {header}
      </div>
      <div className="overflow-y-auto max-h-90">
        <table className="w-full text-xs">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-t">
                <td className="px-4 py-2 font-medium text-muted-foreground w-1/3 align-top">
                  {k}
                </td>
                <td
                  className="px-4 py-2 font-mono break-all align-top"
                  title={fullValue(v)}
                >
                  {displayValue(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DiffViewerDialog({
  log,
  open,
  onOpenChange,
}: DiffViewerDialogProps) {
  if (!log) return null;

  const oldParsed = tryParse(log.OldValues);
  const newParsed = tryParse(log.NewValues);
  const oldFlat = flattenGroup(oldParsed);
  const newFlat = flattenGroup(newParsed);

  const hasOld = Object.keys(oldFlat).length > 0;
  const hasNew = Object.keys(newFlat).length > 0;
  const isUpdate = hasOld && hasNew;

  let diffRows: DiffRow[] = [];
  if (isUpdate) {
    diffRows = computeDiff(oldFlat, newFlat);
  }

  const changedCount = diffRows.filter((r) => r.changed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 gap-4">
        {/* Header */}
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${getActionColor(log.Action)}`}
            >
              {log.Action}
            </span>
            <DialogTitle className="text-lg leading-none">
              Chi tiết thao tác
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground/80">
            <strong>{log.UserName}</strong> đã thao tác trên{" "}
            <strong>{log.EntityName}</strong>
            {log.EntityId && (
              <span className="text-muted-foreground ml-1 font-mono text-xs">
                ({log.EntityId})
              </span>
            )}
          </DialogDescription>
          {/* Metadata chips */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{formatDate(log.CreatedAt)}</span>
            {log.IpAddress && (
              <>
                <span>·</span>
                <span className="font-mono">{log.IpAddress}</span>
              </>
            )}
            {log.ServiceName && (
              <>
                <span>·</span>
                <span>{log.ServiceName.replace("Service", "")}</span>
              </>
            )}
          </div>
        </DialogHeader>

        {/* Error box */}
        {!log.IsSuccess && log.ErrorMessage && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">
            <p className="font-semibold mb-1">Lỗi thực thi:</p>
            <p className="break-words">{log.ErrorMessage}</p>
          </div>
        )}

        {/* Diff section */}
        {isUpdate ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {changedCount > 0
                ? `${changedCount} trường đã thay đổi`
                : "Không có trường nào thay đổi"}
            </p>
            <div className="overflow-y-auto max-h-[55vh] rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted text-muted-foreground">
                    <th className="px-4 py-2 text-left font-semibold w-1/4">
                      Trường
                    </th>
                    <th className="px-4 py-2 text-left font-semibold w-[37.5%]">
                      Giá trị cũ
                    </th>
                    <th className="px-4 py-2 text-left font-semibold w-[37.5%]">
                      Giá trị mới
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((row) => (
                    <tr
                      key={row.key}
                      className={`border-t ${row.changed ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-4 py-2 font-medium align-top">
                        <div className="flex items-center gap-1.5">
                          {row.changed && (
                            <span className="text-amber-500 text-[10px]">
                              ●
                            </span>
                          )}
                          {row.key}
                        </div>
                      </td>
                      <td
                        className="px-4 py-2 font-mono text-red-600 align-top break-all"
                        title={fullValue(row.oldVal)}
                      >
                        {displayValue(row.oldVal)}
                      </td>
                      <td
                        className="px-4 py-2 font-mono text-green-700 align-top break-all"
                        title={fullValue(row.newVal)}
                      >
                        {displayValue(row.newVal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : hasNew ? (
          <FlatTable
            flat={newFlat}
            header="Dữ liệu được tạo"
            headerClass="bg-green-50 text-green-700 border-b border-green-200"
          />
        ) : hasOld ? (
          <FlatTable
            flat={oldFlat}
            header="Dữ liệu bị xóa"
            headerClass="bg-red-50 text-red-700 border-b border-red-200"
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground italic">
            Không có dữ liệu thay đổi
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
