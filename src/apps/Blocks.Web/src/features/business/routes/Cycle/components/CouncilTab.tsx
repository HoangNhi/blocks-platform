import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { Combobox } from "@/components/ui/combobox";
import MultipleSelector, { type Option } from "@/components/ui/multi-select";
import type { Council } from "@/features/business/types/cycle.types";
import { COUNCIL_ROLES } from "@/constants/catalog.constants";
import type { StandardOption } from "@/features/catalog/api/standard.api";

// Council role constants — matches CouncilRole enum in BE
const ROLE_HEAD = 1; // Chủ tịch HĐ — phụ trách tất cả TC
const ROLE_SECRETARY = 3; // Thư ký — không cần phân công TC

// --- Council table column factory ---
interface CouncilColumnHandlers {
  userOptions: { Value?: string; Text?: string }[];
  standards: StandardOption[];
  handleChangeCouncil: (
    id: string,
    field: keyof Council,
    value: string | number | boolean | string[],
  ) => void;
  handleDeleteCouncil: (id: string) => void;
}

function getCouncilMeta(tableMeta: unknown): CouncilColumnHandlers {
  return tableMeta as CouncilColumnHandlers;
}

const councilColumns: ColumnDef<Council>[] = [
  {
    id: "UserId",
    header: "Thành viên",
    meta: { className: "w-[220px]" },
    cell: ({ row, table }) => {
      const { userOptions, handleChangeCouncil } = getCouncilMeta(
        table.options.meta,
      );

      return (
        <Combobox
          options={userOptions}
          value={row.original.UserId}
          onValueChange={(v) =>
            handleChangeCouncil(row.original.Id, "UserId", v)
          }
          placeholder="Chọn thành viên"
          modal
        />
      );
    },
  },
  {
    id: "RoleId",
    header: "Vai trò",
    meta: { className: "w-[160px]" },
    cell: ({ row, table }) => {
      const { handleChangeCouncil } = getCouncilMeta(table.options.meta);

      return (
        <Combobox
          options={COUNCIL_ROLES}
          value={String(row.original.RoleId)}
          onValueChange={(v) =>
            handleChangeCouncil(row.original.Id, "RoleId", Number(v))
          }
          placeholder="Chọn vai trò"
          modal
        />
      );
    },
  },
  {
    id: "AssignedStandardIds",
    header: "Tiêu chuẩn phụ trách",
    cell: ({ row, table }) => {
      const { standards, handleChangeCouncil } = getCouncilMeta(
        table.options.meta,
      );
      const role = Number(row.original.RoleId);
      if (role === ROLE_HEAD) {
        return (
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
            Tất cả TC
          </span>
        );
      }
      if (role === ROLE_SECRETARY) {
        return (
          <span className="text-xs text-gray-400 italic">
            Không cần phân công
          </span>
        );
      }
      const selectedOptions: Option[] = (
        row.original.AssignedStandardIds ?? []
      ).flatMap((id) => {
        const s = standards.find((x) => x.Id === id);
        return s ? [{ value: id, label: s.Code }] : [];
      });
      const allOptions: Option[] = standards.map((s) => ({
        value: s.Id,
        label: s.Code,
      }));
      return (
        <div data-council-selector-row={row.original.Id}>
          <MultipleSelector
            value={selectedOptions}
            defaultOptions={allOptions}
            onChange={(opts) => {
              handleChangeCouncil(
                row.original.Id,
                "AssignedStandardIds",
                opts.map((o) => o.value),
              );
            }}
            placeholder="Chọn tiêu chuẩn..."
            hidePlaceholderWhenSelected
            keepOpenOnSelect
          />
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <span className="flex justify-center">Xóa</span>,
    meta: { className: "w-[60px] text-center" },
    cell: ({ row, table }) => {
      const { handleDeleteCouncil } = getCouncilMeta(table.options.meta);

      return (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteCouncil(row.original.Id)}
          >
            <Trash className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      );
    },
  },
];

interface CouncilTabProps {
  listCouncil: Council[];
  standards: StandardOption[];
  userOptions: { Value?: string; Text?: string }[];
  errors: { listCouncil?: string };
  d15: {
    totalMembers: number;
    enoughMembers: boolean;
    evaluatorCounts: Record<string, number>;
    providerCounts: Record<string, number>;
    insufficientEval: StandardOption[];
    uncoveredProvider: StandardOption[];
  };
  onAdd: () => void;
  onDelete: (id: string) => void;
  onChange: (
    id: string,
    field: keyof Council,
    value: string | number | boolean | string[],
  ) => void;
}

export function CouncilTab({
  listCouncil,
  standards,
  userOptions,
  errors,
  d15,
  onAdd,
  onDelete,
  onChange,
}: CouncilTabProps) {
  return (
    <div className="grid gap-3">
      {/* Đ15 validation summary bar */}
      {listCouncil.length > 0 && (
        <div className="rounded-lg border bg-gray-50 px-3 py-2.5 space-y-1 text-xs">
          <p className="font-semibold text-gray-700 mb-1">Kiểm tra Đ15</p>
          <div className="flex items-center gap-2">
            <span
              className={
                d15.enoughMembers
                  ? "text-green-600 font-bold"
                  : "text-red-500 font-bold"
              }
            >
              {d15.enoughMembers ? "✓" : "✗"}
            </span>
            <span>
              Tổng thành viên: <strong>{d15.totalMembers}</strong>
              {!d15.enoughMembers && (
                <span className="text-red-500 ml-1">(cần ≥ 9 — Đ15.k1)</span>
              )}
            </span>
          </div>
          {standards.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={
                    d15.insufficientEval.length === 0
                      ? "text-green-600 font-bold"
                      : "text-amber-500 font-bold"
                  }
                >
                  {d15.insufficientEval.length === 0 ? "✓" : "⚠"}
                </span>
                <span>
                  TC có &lt; 3 thành viên đánh giá:{" "}
                  {d15.insufficientEval.length === 0 ? (
                    <span className="text-green-600">Tất cả đạt</span>
                  ) : (
                    <span className="text-amber-600">
                      {d15.insufficientEval.map((s) => s.Code).join(", ")}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    d15.uncoveredProvider.length === 0
                      ? "text-green-600 font-bold"
                      : "text-amber-500 font-bold"
                  }
                >
                  {d15.uncoveredProvider.length === 0 ? "✓" : "⚠"}
                </span>
                <span>
                  TC chưa có người cung cấp MC:{" "}
                  {d15.uncoveredProvider.length === 0 ? (
                    <span className="text-green-600">Tất cả đạt</span>
                  ) : (
                    <span className="text-amber-600">
                      {d15.uncoveredProvider.map((s) => s.Code).join(", ")}
                    </span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        <Label>Danh sách hội đồng</Label>
        <Button type="button" size="sm" onClick={onAdd} className="flex gap-2">
          <Plus className="w-4 h-4" /> Thêm thành viên
        </Button>
      </div>

      {errors.listCouncil && (
        <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-200">
          {errors.listCouncil}
        </div>
      )}

      <DataTable
        columns={councilColumns}
        data={listCouncil}
        getRowId={(row) => row.Id}
        containerClassName="max-h-[400px] overflow-auto w-full relative"
        meta={{
          userOptions,
          standards,
          handleChangeCouncil: onChange,
          handleDeleteCouncil: onDelete,
        }}
        getRowClassName={(row) => {
          const role = Number(row.RoleId);
          const needsAssignment =
            role !== ROLE_HEAD &&
            role !== ROLE_SECRETARY &&
            standards.length > 0 &&
            (row.AssignedStandardIds ?? []).length === 0;
          return needsAssignment ? "bg-amber-50" : undefined;
        }}
      />

      {/* Working Group summary */}
      {standards.length > 0 && listCouncil.length > 0 && (
        <div className="rounded-lg border p-3 bg-white">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Tổng hợp Nhóm công tác
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left font-medium text-gray-600">
                    Tiêu chuẩn
                  </th>
                  <th className="border px-2 py-1 text-center font-medium text-gray-600">
                    Thành viên đánh giá
                  </th>
                  <th className="border px-2 py-1 text-center font-medium text-gray-600">
                    Người cung cấp MC
                  </th>
                </tr>
              </thead>
              <tbody>
                {standards.map((s) => {
                  const evCnt = d15.evaluatorCounts[s.Id] ?? 0;
                  const pvCnt = d15.providerCounts[s.Id] ?? 0;
                  return (
                    <tr key={s.Id} className={evCnt < 3 ? "bg-amber-50" : ""}>
                      <td className="border px-2 py-1 font-medium text-gray-700">
                        {s.Code}
                      </td>
                      <td
                        className={`border px-2 py-1 text-center ${
                          evCnt < 3
                            ? "text-red-500 font-semibold"
                            : "text-green-600"
                        }`}
                      >
                        {evCnt}
                        {evCnt < 3 && (
                          <span className="ml-1 text-red-400 font-normal">
                            / 3
                          </span>
                        )}
                      </td>
                      <td
                        className={`border px-2 py-1 text-center ${
                          pvCnt === 0
                            ? "text-amber-600 font-semibold"
                            : "text-green-600"
                        }`}
                      >
                        {pvCnt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
