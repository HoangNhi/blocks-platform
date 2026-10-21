import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/datepicker";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { format } from "date-fns";
import type { Cycle } from "@/features/business/types/cycle.types";
import { CYCLE_STATUS_OPTIONS, CYCLE_SCOPE_OPTIONS } from "@/constants/catalog.constants";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import { CouncilTab } from "./components/CouncilTab";
import { EvaluationScheduleTab } from "./components/EvaluationScheduleTab";
import { useCycleForm } from "./hooks/useCycleForm";



interface PopupCycleProps {
  cycle: Cycle | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (cycle: Cycle, isAddMore: boolean) => void;
  isLoading: boolean;
}

const PopupCycle = ({
  cycle,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: PopupCycleProps) => {
  const {
    formData,
    listCouncil,
    listEvaluationSchedule,
    standards,
    errors,
    userOptions,
    d15,
    updateField,
    handleYearChange,
    handleAddCouncil,
    handleDeleteCouncil,
    handleChangeCouncil,
    handleAddEvaluationSchedule,
    handleDeleteEvaluationSchedule,
    handleChangeEvaluationSchedule,
    onSubmit,
  } = useCycleForm({ cycle, isOpen, saveChange });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-6xl max-h-[95vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b pb-2">
          <DialogTitle>
            {cycle?.IsEdit ? "Cập nhật chu kỳ" : "Thêm mới chu kỳ"}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Basic info fields */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8">
              <Field>
                <FieldLabel>
                  Chu kỳ <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                  {errors.name && <FieldError>{errors.name}</FieldError>}
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-4">
              <Field>
                <FieldLabel>
                  Năm <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    value={formData.year}
                    onChange={handleYearChange}
                    min={1900}
                    max={2100}
                  />
                  {errors.year && <FieldError>{errors.year}</FieldError>}
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-6">
              <Field>
                <FieldLabel>
                  Ngày bắt đầu <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <DatePicker
                    className="w-full"
                    value={
                      formData.startDate
                        ? new Date(formData.startDate)
                        : undefined
                    }
                    onChange={(date) =>
                      updateField(
                        "startDate",
                        date ? format(date, "yyyy-MM-dd") : "",
                      )
                    }
                  />
                  {errors.startDate && (
                    <FieldError>{errors.startDate}</FieldError>
                  )}
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-6">
              <Field>
                <FieldLabel>
                  Ngày kết thúc <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <DatePicker
                    className="w-full"
                    value={
                      formData.endDate ? new Date(formData.endDate) : undefined
                    }
                    onChange={(date) =>
                      updateField(
                        "endDate",
                        date ? format(date, "yyyy-MM-dd") : "",
                      )
                    }
                  />
                  {errors.endDate && <FieldError>{errors.endDate}</FieldError>}
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-4">
              <Field>
                <FieldLabel>
                  Bộ tiêu chuẩn <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    fetchOptions={async () => {
                      const res = await standardSetService.getAllCombobox();
                      return (res.Data || []).map((t: { Value?: string; Text?: string }) => ({
                        Value: t.Value ?? "",
                        Text: t.Text ?? "",
                      }));
                    }}
                    value={formData.standardSetId}
                    onValueChange={(val) =>
                      updateField("standardSetId", val || "")
                    }
                    placeholder="Chọn bộ tiêu chuẩn"
                    searchPlaceholder="Tìm kiếm bộ tiêu chuẩn..."
                    emptyText="Không tìm thấy bộ tiêu chuẩn."
                    modal
                  />
                  {errors.standardSetId && (
                    <FieldError>{errors.standardSetId}</FieldError>
                  )}
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-4">
              <Field>
                <FieldLabel>Trạng thái</FieldLabel>
                <FieldContent>
                  <Input
                    value={
                      CYCLE_STATUS_OPTIONS.find(
                        (o) => String(o.Value) === formData.status,
                      )?.Text ?? formData.status
                    }
                    disabled
                    readOnly
                  />
                </FieldContent>
              </Field>
            </div>

            <div className="col-span-4">
              <Field>
                <FieldLabel>Phạm vi</FieldLabel>
                <FieldContent>
                  <Combobox
                    options={CYCLE_SCOPE_OPTIONS}
                    value={formData.scope}
                    onValueChange={(val) => updateField("scope", val || "1")}
                    placeholder="Chọn phạm vi"
                    searchPlaceholder="Tìm kiếm phạm vi..."
                    emptyText="Không tìm thấy phạm vi."
                    modal
                  />
                </FieldContent>
              </Field>
            </div>
          </div>

          {/* Tabs: Purpose / Council / Schedule */}
          <Tabs defaultValue="purpose">
            <TabsList>
              <TabsTrigger value="purpose">Mục đích đánh giá</TabsTrigger>
              <TabsTrigger value="council">Hội đồng</TabsTrigger>
              <TabsTrigger value="schedule">Thời gian biểu</TabsTrigger>
            </TabsList>

            {/* --- Purpose tab --- */}
            <TabsContent value="purpose">
              <Field>
                <FieldLabel>
                  Mục đích đánh giá <span className="text-red-500">*</span>
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    placeholder="Nhập mục đích đánh giá"
                    value={formData.evaluationPurpose}
                    onChange={(e) =>
                      updateField("evaluationPurpose", e.target.value)
                    }
                  />
                  {errors.evaluationPurpose && (
                    <FieldError>{errors.evaluationPurpose}</FieldError>
                  )}
                </FieldContent>
              </Field>
            </TabsContent>

            {/* --- Council tab --- */}
            <TabsContent value="council">
              <CouncilTab
                listCouncil={listCouncil}
                standards={standards}
                userOptions={userOptions}
                errors={errors}
                d15={d15}
                onAdd={handleAddCouncil}
                onDelete={handleDeleteCouncil}
                onChange={handleChangeCouncil}
              />
            </TabsContent>

            <TabsContent value="schedule">
              <EvaluationScheduleTab
                listEvaluationSchedule={listEvaluationSchedule}
                userOptions={userOptions}
                errors={errors}
                onAdd={handleAddEvaluationSchedule}
                onDelete={handleDeleteEvaluationSchedule}
                onChange={handleChangeEvaluationSchedule}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t pt-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isLoading}>
              Hủy
            </Button>
          </DialogClose>
          <Button onClick={() => onSubmit(false)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
          {!cycle?.IsEdit && (
            <Button
              type="button"
              onClick={() => onSubmit(true)}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu và thêm tiếp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PopupCycle;

