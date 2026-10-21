import { useMemo } from "react";
import * as XLSX from "xlsx";

interface CellMeta {
  value: string;
  type: "n" | "s" | "b" | "e" | "d" | ""; // number, string, boolean, error, date
  colSpan?: number;
  rowSpan?: number;
  width?: number; // px, derived from ColInfo
}

interface ExcelViewerProps {
  workbook: XLSX.WorkBook;
  activeSheet: string;
  onSheetChange: (name: string) => void;
  zoom?: number; // 50-200, default 100
}

const MAX_ROWS = 100;

function buildRows(ws: XLSX.WorkSheet): {
  rows: CellMeta[][];
  colWidths: number[];
  truncated: boolean;
} {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const colCount = range.e.c - range.s.c + 1;
  const maxRowIndex = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);

  // Derive column widths from ColInfo (wch = character width)
  const colWidths: number[] = Array.from({ length: colCount }, (_, i) => {
    const info = ws["!cols"]?.[i];
    return info?.wch ? Math.max(60, Math.min(300, info.wch * 7)) : 100;
  });

  // Resolve merge ranges into a lookup map: "R,C" -> { colSpan, rowSpan } | null
  const mergeMap = new Map<
    string,
    { colSpan: number; rowSpan: number } | null
  >();
  for (const merge of ws["!merges"] ?? []) {
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const key = `${r},${c}`;
        if (r === merge.s.r && c === merge.s.c) {
          mergeMap.set(key, {
            colSpan: merge.e.c - merge.s.c + 1,
            rowSpan: merge.e.r - merge.s.r + 1,
          });
        } else {
          mergeMap.set(key, null); // null = hidden (covered by merge)
        }
      }
    }
  }

  const rows: CellMeta[][] = [];

  for (let r = range.s.r; r <= maxRowIndex; r++) {
    const row: CellMeta[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const mergeInfo = mergeMap.get(`${r},${c}`);
      if (mergeInfo === null) {
        // Skip — covered by a merge span
        continue;
      }
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell: XLSX.CellObject | undefined = ws[addr];
      row.push({
        value: cell ? XLSX.utils.format_cell(cell) : "",
        type: (cell?.t as CellMeta["type"]) ?? "",
        colSpan: mergeInfo?.colSpan,
        rowSpan: mergeInfo?.rowSpan,
        width: colWidths[c - range.s.c],
      });
    }
    rows.push(row);
  }

  const truncated = range.e.r - range.s.r + 1 > MAX_ROWS;
  return { rows, colWidths, truncated };
}

export function ExcelViewer({
  workbook,
  activeSheet,
  onSheetChange,
  zoom = 100,
}: ExcelViewerProps) {
  const ws = workbook.Sheets[activeSheet];

  const { rows, colWidths, truncated } = useMemo(
    () => (ws ? buildRows(ws) : { rows: [], colWidths: [], truncated: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSheet, ws],
  );

  const colLetters = useMemo(
    () => colWidths.map((_, i) => XLSX.utils.encode_col(i)),
    [colWidths],
  );

  const isNumeric = (type: CellMeta["type"]) => type === "n" || type === "d";

  if (!ws || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        Sheet trống hoặc không có dữ liệu.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/5">
      {/* Truncation warning */}
      {truncated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 shrink-0 flex items-center gap-2">
          <span>
            ⚠️ Chỉ hiển thị {MAX_ROWS.toLocaleString()} hàng đầu tiên. Tải xuống
            để xem toàn bộ.
          </span>
        </div>
      )}

      {/* Scrollable grid area */}
      <div id="excel-print-container" className="flex-1 overflow-auto relative">
        <table
          className="border-collapse text-sm"
          style={{ fontSize: `${zoom}%` }}
        >
          {/* Column letter header row (sticky top) */}
          <thead className="sticky top-0 z-20">
            <tr>
              {/* Row number gutter corner */}
              <th className="w-10 min-w-[2.5rem] bg-slate-100 border border-slate-300 text-center text-xs text-slate-400 font-normal" />
              {colLetters.map((letter, ci) => (
                <th
                  key={ci}
                  className="bg-slate-100 border border-slate-300 text-center text-xs font-medium text-slate-500 px-1 py-1 select-none"
                  style={{ minWidth: colWidths[ci] }}
                >
                  {letter}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-blue-50/30">
                {/* Row number */}
                <td className="w-10 min-w-[2.5rem] bg-slate-100 border border-slate-300 text-center text-xs text-slate-400 select-none px-1">
                  {ri + 1}
                </td>

                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={[
                      "border border-slate-200 px-2 py-1 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis",
                      ri === 0
                        ? "font-semibold bg-slate-50 text-slate-700 border-b-2 border-b-slate-300"
                        : "text-slate-800",
                      isNumeric(cell.type)
                        ? "text-right tabular-nums"
                        : "text-left",
                    ].join(" ")}
                    title={cell.value}
                    style={{ minWidth: colWidths[ci] }}
                  >
                    {cell.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs toolbar (bottom) */}
      {workbook.SheetNames.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-t border-slate-200 overflow-x-auto shrink-0">
          {workbook.SheetNames.map((name) => (
            <button
              key={name}
              onClick={() => onSheetChange(name)}
              className={[
                "px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors",
                name === activeSheet
                  ? "bg-white text-blue-600 ring-1 ring-blue-400 shadow-sm"
                  : "text-slate-500 hover:bg-slate-200",
              ].join(" ")}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
