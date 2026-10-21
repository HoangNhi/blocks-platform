import type { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useStandardSetOptions } from "@/features/catalog/hooks/useStandardSetOptions";
import StandardCriteriaTable from "@/features/catalog/components/StandardCriteriaTable";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CriteriaMappingPanelProps {
    form: UseFormReturn<any>;
    cycleIdForm: string;
    fileTypeIdForm: string;
    standardSetId: string;
    setStandardSetId: (val: string) => void;
    assignedStandardIds: string[];
    cycleId_Change: (val: string) => Promise<void>;
    onShowReusePopup?: () => void;
    isPending?: boolean;
    readOnly?: boolean;
}

export function CriteriaMappingPanel({
    form,
    cycleIdForm,
    fileTypeIdForm,
    standardSetId,
    setStandardSetId,
    assignedStandardIds,
    cycleId_Change,
    onShowReusePopup,
    isPending,
    readOnly,
}: CriteriaMappingPanelProps) {
    const { options: cycleOptions, isLoading: isCycleLoading } = useCycleOptions();
    const { options: standardSetOptions, isLoading: isStandardSetLoading } = useStandardSetOptions();

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 p-2">
            {/* Cycle Selection */}
            <FormField
                control={form.control}
                name="cycleId"
                render={({ field }) => (
                    <FormItem>
                        <div className="flex items-center justify-between">
                            <FormLabel>
                                Chu kỳ <span className="text-red-500">*</span>
                            </FormLabel>
                            {onShowReusePopup && !isPending && !readOnly && (
                                <Button
                                    variant="ghost"
                                    type="button"
                                    size="sm"
                                    onClick={onShowReusePopup}
                                    disabled={!cycleIdForm}
                                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300 rounded-lg transition-colors whitespace-nowrap"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Tái sử dụng minh chứng cũ
                                </Button>
                            )}
                        </div>
                        <FormControl>
                            <Combobox
                                options={cycleOptions}
                                loading={isCycleLoading}
                                value={field.value}
                                onValueChange={async (val) => {
                                    if (readOnly) return;
                                    field.onChange(val || "");
                                    cycleId_Change(val || "");
                                }}
                                placeholder="Chọn chu kỳ"
                                searchPlaceholder="Tìm kiếm chu kỳ..."
                                emptyText="Không tìm thấy chu kỳ."
                                readonly={!!readOnly}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Standard Set */}
            <div className="space-y-2">
                <FormLabel>
                    Bộ tiêu chuẩn <span className="text-red-500">*</span>
                </FormLabel>
                <Combobox
                    options={standardSetOptions}
                    loading={isStandardSetLoading}
                    value={standardSetId}
                    onValueChange={(val) => setStandardSetId(val || "")}
                    placeholder="Chọn bộ tiêu chuẩn"
                    searchPlaceholder="Tìm kiếm bộ tiêu chuẩn..."
                    emptyText="Không tìm thấy bộ tiêu chuẩn."
                    readonly={true}
                />
            </div>

            {/* Criteria Table */}
            <StandardCriteriaTable
                cycleId={cycleIdForm}
                standardSetId={standardSetId}
                selectedFileTypeId={fileTypeIdForm}
                assignedStandardIds={assignedStandardIds}
            />
            {cycleIdForm && (
                <p className="text-[11px] text-slate-400 px-1 pt-1 leading-relaxed">
                    Tiêu chí lạc theo loại tài liệu đã chọn. Tiến độ cập nhật sau khi minh chứng được phê duyệt.
                </p>
            )}
        </div>
    );
}
