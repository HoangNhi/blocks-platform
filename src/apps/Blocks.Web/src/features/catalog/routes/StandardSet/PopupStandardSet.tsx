import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  ACTIVE_STATUS_OPTIONS,
  CHART_TYPE_OPTIONS,
  EVALUATION_MODE_OPTIONS,
} from "@/constants/catalog.constants";
import type { StandardSet } from "@/features/catalog/types/standardset.types";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { v4 as uuidv4 } from "uuid";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  id: z.string(),
  code: z.string().min(1, "Mã bộ tiêu chuẩn là bắt buộc"),
  name: z.string().min(1, "Tên bộ tiêu chuẩn là bắt buộc"),
  evaluationMode: z.number(),
  chartType: z.number(),
  isActived: z.boolean(),
});

const PopupStandardSet = ({
  standardSet,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: {
  standardSet: StandardSet | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (
    standardSet: StandardSet & { IsEdit: boolean },
    isAddMore: boolean,
  ) => void;
  isLoading?: boolean;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: standardSet?.Id || uuidv4(),
      code: standardSet?.Code || "",
      name: standardSet?.Name || "",
      evaluationMode: standardSet?.EvaluationMode ?? 1,
      chartType: standardSet?.ChartType ?? 0,
      isActived: standardSet?.IsActived ?? true,
    },
  });

  useEffect(() => {
    if (standardSet) {
      form.reset({
        id: standardSet.Id || uuidv4(),
        code: standardSet.Code || "",
        name: standardSet.Name || "",
        evaluationMode: standardSet.EvaluationMode ?? 1,
        chartType: standardSet.ChartType ?? 0,
        isActived: standardSet.IsActived ?? true,
      });
    } else {
      form.reset({
        id: uuidv4(),
        code: "",
        name: "",
        evaluationMode: 1,
        chartType: 0,
        isActived: true,
      });
    }
  }, [standardSet, form]);

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    const payload = {
      Id: values.id,
      Code: values.code.trim(),
      Name: values.name.trim(),
      EvaluationMode: values.evaluationMode,
      ChartType: values.chartType,
      IsActived: values.isActived,
      IsEdit: standardSet?.IsEdit || false,
      FolderUpload: "",
      CreatedBy: "",
      CreatedAt: "",
      UpdatedBy: "",
      UpdatedAt: "",
    };
    saveChange(payload as StandardSet & { IsEdit: boolean }, isAddMore);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => onSubmit(data, false))}
            className="grid gap-4 py-4"
          >
            <DialogHeader>
              <DialogTitle>
                {standardSet?.IsEdit
                  ? "Cập nhật Bộ Tiêu Chuẩn"
                  : "Thêm mới Bộ Tiêu Chuẩn"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Mã bộ tiêu chuẩn <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập mã bộ tiêu chuẩn" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tên bộ tiêu chuẩn <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập tên bộ tiêu chuẩn" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="evaluationMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Chế độ đánh giá <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Combobox
                        options={EVALUATION_MODE_OPTIONS}
                        value={field.value.toString()}
                        onValueChange={(val) => field.onChange(Number(val))}
                        placeholder="Chọn chế độ đánh giá"
                        searchPlaceholder="Tìm kiếm chế độ đánh giá..."
                        emptyText="Không tìm thấy chế độ đánh giá."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chartType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chart Dashboard</FormLabel>
                    <FormControl>
                      <Combobox
                        options={CHART_TYPE_OPTIONS}
                        value={field.value.toString()}
                        onValueChange={(val) => field.onChange(Number(val))}
                        placeholder="Chọn loại chart"
                        searchPlaceholder="Tìm kiếm loại chart..."
                        emptyText="Không tìm thấy loại chart."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Hủy
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
              {!standardSet?.IsEdit && (
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => onSubmit(data, true))}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Lưu và thêm tiếp
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PopupStandardSet;
