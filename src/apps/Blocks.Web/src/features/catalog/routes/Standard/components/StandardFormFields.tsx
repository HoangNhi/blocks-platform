import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { ACTIVE_STATUS_OPTIONS } from "@/constants/catalog.constants";
import type { UseFormReturn } from "react-hook-form";

export interface StandardFormFieldsProps {
    form: UseFormReturn<any>;
    standardSetOptions: { Value?: string; Text?: string }[];
    handleStandardSetChange: (val: string) => void;
}

export function StandardFormFields({
    form,
    standardSetOptions,
    handleStandardSetChange,
}: StandardFormFieldsProps) {
    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 border-l-4 border-blue-500 pl-3">
                Thông tin tiêu chuẩn
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4">
                    <FormField
                        control={form.control}
                        name="standardSetId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Bộ tiêu chuẩn <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Combobox
                                        options={standardSetOptions}
                                        value={field.value}
                                        onValueChange={handleStandardSetChange}
                                        placeholder="Chọn bộ tiêu chuẩn"
                                        searchPlaceholder="Tìm kiếm bộ tiêu chuẩn..."
                                        emptyText="Không tìm thấy bộ tiêu chuẩn."
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-4">
                    <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Mã tiêu chuẩn <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="VD: AUN-QA-01" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Tên tiêu chuẩn <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="VD: Mục tiêu dự kiến của chương trình đào tạo"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-6 md:row-span-2">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mô tả</FormLabel>
                                <FormControl>
                                    <Textarea
                                        {...field}
                                        rows={4}
                                        className="h-full min-h-30"
                                        placeholder="Nhập mô tả chi tiết về tiêu chuẩn..."
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-6">
                    <FormField
                        control={form.control}
                        name="order"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Thứ tự <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        min={0}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-6">
                    <FormField
                        control={form.control}
                        name="isActived"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Trạng thái</FormLabel>
                                <FormControl>
                                    <Combobox
                                        options={ACTIVE_STATUS_OPTIONS}
                                        value={field.value.toString()}
                                        onValueChange={(val) => field.onChange(val === "true")}
                                        placeholder="Chọn trạng thái"
                                        searchPlaceholder="Tìm kiếm trạng thái..."
                                        emptyText="Không tìm thấy trạng thái."
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>
        </div>
    );
}
