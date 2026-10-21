import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Criterion, CriterionRequirement } from "@/features/catalog/types/standard.types";

interface CriterionListProps {
    criterions: Criterion[];
    fileTypeOptions: { Value?: string; Text?: string }[];
    error?: string;
    onAddCriterion: () => void;
    onUpdateCriterion: (id: string, updates: Partial<Criterion>) => void;
    onDeleteCriterion: (id: string) => void;
    onAddFileRequirement: (criterionId: string) => void;
    onUpdateFileRequirement: (
        criterionId: string,
        requirementId: string,
        updates: Partial<CriterionRequirement>,
    ) => void;
    onDeleteFileRequirement: (criterionId: string, requirementId: string) => void;
}

export function CriterionList({
    criterions,
    fileTypeOptions,
    error,
    onAddCriterion,
    onUpdateCriterion,
    onDeleteCriterion,
    onAddFileRequirement,
    onUpdateFileRequirement,
    onDeleteFileRequirement,
}: CriterionListProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-l-4 border-indigo-500 pl-3">
                    Danh sách Tiêu chí & Yêu cầu Minh chứng
                </h3>
                <Button
                    type="button"
                    size="sm"
                    onClick={onAddCriterion}
                    className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm tiêu chí
                </Button>
            </div>

            {error && (
                <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg border border-red-200">
                    {error}
                </div>
            )}

            {criterions.map((criterion) => (
                <div
                    key={criterion.Id}
                    className="criterion-card bg-white rounded-xl border border-slate-200 shadow-sm relative group animate-in overflow-hidden"
                >
                    {/* Remove Button */}
                    <button
                        type="button"
                        onClick={() => onDeleteCriterion(criterion.Id)}
                        className="absolute top-2 right-2 z-20 text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                        title="Xóa tiêu chí"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                        {/* Left: Criterion Info */}
                        <div className="lg:col-span-5 p-5 bg-slate-50/30">
                            <div className="flex gap-4 mb-4">
                                <div className="w-20">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                        Mã
                                    </label>
                                    <Input
                                        value={criterion.Code}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.Id, {
                                                Code: e.target.value,
                                            })
                                        }
                                        placeholder="1.1"
                                        className="text-center font-bold"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                        Tên tiêu chí
                                    </label>
                                    <Input
                                        value={criterion.Name}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.Id, {
                                                Name: e.target.value,
                                            })
                                        }
                                        placeholder="Nhập tên tiêu chí..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                {/* IsPrerequisite */}
                                <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
                                    <Checkbox
                                        checked={criterion.IsPrerequisite}
                                        onCheckedChange={(checked) =>
                                            onUpdateCriterion(criterion.Id, {
                                                IsPrerequisite: checked === true,
                                            })
                                        }
                                        className="h-4 w-4 rounded border-amber-300 text-amber-600"
                                    />
                                    <div>
                                        <span className="block text-xs font-bold text-amber-800">
                                            Tiêu chí Điều kiện
                                        </span>
                                        <span className="block text-[10px] text-amber-600/80">
                                            Nếu trượt tiêu chí này, cả tiêu chuẩn bị trượt
                                        </span>
                                    </div>
                                </label>

                                {/* DiagnosticQuestions */}
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                        Câu hỏi chẩn đoán
                                    </label>
                                    <Textarea
                                        rows={3}
                                        value={criterion.DiagnosticQuestions || ""}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.Id, {
                                                DiagnosticQuestions: e.target.value,
                                            })
                                        }
                                        placeholder="- Nhà trường có văn bản nào quy định về...?"
                                        className="resize-none text-xs"
                                    />
                                    <p className="text-[9px] text-slate-400 mt-1 text-right">
                                        Hỗ trợ viết báo cáo tổng đánh giá
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Right: File Requirements */}
                        <div className="lg:col-span-7 p-5">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-slate-600 uppercase">
                                    Yêu cầu minh chứng
                                </h4>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => onAddFileRequirement(criterion.Id)}
                                    className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 h-auto border border-blue-100"
                                >
                                    + THÊM LOẠI FILE
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                                {criterion.CriterionRequirements?.map((req) => (
                                    <div
                                        key={req.Id}
                                        className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col gap-2 hover:border-blue-200 transition-all animate-in"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Combobox
                                                options={fileTypeOptions}
                                                value={req.FileTypeId}
                                                onValueChange={(val) =>
                                                    onUpdateFileRequirement(criterion.Id, req.Id, {
                                                        FileTypeId: val,
                                                    })
                                                }
                                                placeholder="-- Chọn loại tài liệu --"
                                                searchPlaceholder="Tìm kiếm..."
                                                emptyText="Không tìm thấy"
                                                className="flex-1 text-xs h-8"
                                            />

                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1">
                                                <span className="text-[10px] text-slate-400 font-bold">
                                                    SL:
                                                </span>
                                                <Input
                                                    type="number"
                                                    value={req.MinQuantity}
                                                    onChange={(e) =>
                                                        onUpdateFileRequirement(criterion.Id, req.Id, {
                                                            MinQuantity: parseInt(e.target.value) || 1,
                                                        })
                                                    }
                                                    min={1}
                                                    className="w-12 text-center text-xs font-bold h-6 px-1"
                                                />
                                            </div>

                                            <label className="flex items-center gap-1 cursor-pointer select-none">
                                                <Checkbox
                                                    checked={req.IsMandatory}
                                                    onCheckedChange={(checked) =>
                                                        onUpdateFileRequirement(criterion.Id, req.Id, {
                                                            IsMandatory: checked === true,
                                                        })
                                                    }
                                                    className="h-3 w-3 rounded border-slate-300 text-blue-600"
                                                />
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    Bắt buộc
                                                </span>
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onDeleteFileRequirement(criterion.Id, req.Id)
                                                }
                                                className="text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {/* Suggestion Input */}
                                        <Input
                                            value={req.Suggestion || ""}
                                            onChange={(e) =>
                                                onUpdateFileRequirement(criterion.Id, req.Id, {
                                                    Suggestion: e.target.value,
                                                })
                                            }
                                            placeholder="Gợi ý: 'Quyết định thành lập hội đồng'..."
                                            className="bg-transparent text-[11px] text-slate-600 italic placeholder:text-slate-300 border-b border-dashed border-slate-200 focus:border-blue-300 outline-none rounded-none h-6 px-1"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                                <p className="text-[10px] text-slate-400 italic">
                                    Hệ thống sẽ đối chiếu danh sách này với file thực tế
                                    user upload để báo cáo thiếu/dư.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
