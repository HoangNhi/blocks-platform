import { useEffect, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { StandardFormFields } from "./components/StandardFormFields";
import { CriterionList } from "./components/CriterionList";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import { fileTypeService } from "@/features/catalog/api/filetype.api";
import type {
  Standard,
  Criterion,
  CriterionRequirement,
} from "@/features/catalog/types/standard.types";
import { toast } from "sonner";

interface PopupStandardProps {
  standard: Standard | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (standard: Standard, isAddMore: boolean) => void;
  isLoading: boolean;
}

import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  id: z.string(),
  standardSetId: z.string().min(1, "Bộ tiêu chuẩn không được để trống"),
  code: z.string().min(1, "Mã tiêu chuẩn không được để trống"),
  name: z.string().min(1, "Tên tiêu chuẩn không được để trống"),
  description: z.string().optional(),
  order: z.number().min(0, "Thứ tự phải lớn hoặc bằng 0"),
  isActived: z.boolean(),
});

const PopupStandard = ({
  standard,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: PopupStandardProps) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: standard?.Id || uuidv4(),
      standardSetId: standard?.StandardSetId || "",
      code: standard?.Code || "",
      name: standard?.Name || "",
      description: standard?.Description || "",
      order: standard?.Order || 1,
      isActived: standard?.IsActived ?? true,
    },
  });



  // Criterions state
  const [criterions, setCriterions] = useState<Criterion[]>(
    standard?.Criterions || [],
  );

  // Errors state for complex arrays
  const [errors, setErrors] = useState<{
    criterions?: string;
  }>({});

  // Fetch StandardSet options
  const { data: standardSetResponse } = useQuery({
    queryKey: ["standardSets", "combobox"],
    queryFn: () => standardSetService.getAllCombobox(),
    enabled: isOpen,
  });

  const standardSetOptions = standardSetResponse?.Data || [];

  // Fetch FileType options
  const { data: fileTypeResponse } = useQuery({
    queryKey: ["fileTypes", "combobox"],
    queryFn: () => fileTypeService.getAllCombobox(),
    enabled: isOpen,
  });

  const fileTypeOptions = fileTypeResponse?.Data || [];

  // Sync form data when standard changes
  useEffect(() => {
    if (standard) {
      form.reset({
        id: standard.Id || uuidv4(),
        standardSetId: standard.StandardSetId || "",
        code: standard.Code || "",
        name: standard.Name || "",
        description: standard.Description || "",
        order: standard.Order || 1,
        isActived: standard.IsActived ?? true,
      });
      setCriterions(standard.Criterions || []);
      setErrors({});

    }
  }, [standard, form]);

  // Handle StandardSet change
  const handleStandardSetChange = useCallback(
    async (val: string) => {
      form.setValue("standardSetId", val, { shouldValidate: true });

    },
    [form],
  );

  // Criterion handlers
  const addCriterion = useCallback(() => {
    const nextOrder =
      criterions.length === 0
        ? 1
        : Math.max(...criterions.map((c) => c.Order || 0)) + 1;

    const newCriterion: Criterion = {
      Id: uuidv4(),
      StandardId: form.getValues().id,
      Code: "",
      Name: "",
      IsPrerequisite: false,
      DiagnosticQuestions: "",
      Description: "",
      Order: nextOrder,
      CriterionRequirements: [
        {
          Id: uuidv4(),
          CriterionId: "",
          FileTypeId: "",
          IsMandatory: true,
          MinQuantity: 1,
          Suggestion: "",
          IsActived: true,
          IsEdit: false,
          FolderUpload: "",
          CreatedBy: "",
          CreatedAt: "",
        },
      ],
      IsActived: true,
      IsEdit: false,
      FolderUpload: "",
      CreatedBy: "",
      CreatedAt: "",
    };

    setCriterions((prev) => [...prev, newCriterion]);

    // Auto scroll to new criterion
    setTimeout(() => {
      const cards = document.querySelectorAll(".criterion-card");
      if (cards.length > 0) {
        cards[cards.length - 1].scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 100);
  }, [criterions, form]);

  const updateCriterion = useCallback(
    (id: string, updates: Partial<Criterion>) => {
      setCriterions((prev) =>
        prev.map((c) => (c.Id === id ? { ...c, ...updates } : c)),
      );
    },
    [],
  );

  const deleteCriterion = useCallback((id: string) => {
    setCriterions((prev) => prev.filter((c) => c.Id !== id));
  }, []);

  // File requirement handlers
  const addFileRequirement = useCallback((criterionId: string) => {
    setCriterions((prev) =>
      prev.map((c) => {
        if (c.Id === criterionId) {
          const newRequirement: CriterionRequirement = {
            Id: uuidv4(),
            CriterionId: criterionId,
            FileTypeId: "",
            IsMandatory: true,
            MinQuantity: 1,
            Suggestion: "",
            IsActived: true,
            IsEdit: false,
            FolderUpload: "",
            CreatedBy: "",
            CreatedAt: "",
          };
          return {
            ...c,
            CriterionRequirements: [
              ...(c.CriterionRequirements || []),
              newRequirement,
            ],
          };
        }
        return c;
      }),
    );
  }, []);

  const updateFileRequirement = useCallback(
    (
      criterionId: string,
      requirementId: string,
      updates: Partial<CriterionRequirement>,
    ) => {
      setCriterions((prev) =>
        prev.map((c) => {
          if (c.Id === criterionId) {
            return {
              ...c,
              CriterionRequirements: c.CriterionRequirements?.map((req) =>
                req.Id === requirementId ? { ...req, ...updates } : req,
              ),
            };
          }
          return c;
        }),
      );
    },
    [],
  );

  const deleteFileRequirement = useCallback(
    (criterionId: string, requirementId: string) => {
      setCriterions((prev) =>
        prev.map((c) => {
          if (c.Id === criterionId) {
            return {
              ...c,
              CriterionRequirements: c.CriterionRequirements?.filter(
                (req) => req.Id !== requirementId,
              ),
            };
          }
          return c;
        }),
      );
    },
    [],
  );

  // Validation for arrays
  const validateArrays = (): boolean => {
    const newErrors: typeof errors = {};

    // Criterions validation
    if (criterions.length === 0) {
      newErrors.criterions = "Phải có ít nhất 1 tiêu chí";
      toast.error("Phải có ít nhất 1 tiêu chí");
    } else {
      // Validate each criterion
      for (const criterion of criterions) {
        if (!criterion.Code.trim() || !criterion.Name.trim()) {
          newErrors.criterions = "Tất cả tiêu chí phải có Mã và Tên";
          toast.error("Tất cả tiêu chí phải có Mã và Tên");
          break;
        }

        // Validate requirements
        if (
          !criterion.CriterionRequirements ||
          criterion.CriterionRequirements.length === 0
        ) {
          newErrors.criterions =
            "Mỗi tiêu chí phải có ít nhất 1 yêu cầu minh chứng";
          toast.error("Mỗi tiêu chí phải có ít nhất 1 yêu cầu minh chứng");
          break;
        }

        for (const req of criterion.CriterionRequirements) {
          if (!req.FileTypeId) {
            newErrors.criterions =
              "Tất cả yêu cầu minh chứng phải chọn Loại tài liệu";
            toast.error("Tất cả yêu cầu minh chứng phải chọn Loại tài liệu");
            break;
          }
          if (req.MinQuantity < 0) {
            newErrors.criterions = "Số lượng tối thiểu phải >= 0";
            toast.error("Số lượng tối thiểu phải >= 0");
            break;
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit
  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    if (!validateArrays()) {
      return;
    }

    // Build payload with nested structure
    const criterionsWithIds = criterions.map((c) => ({
      ...c,
      StandardId: values.id,
      CriterionRequirements: c.CriterionRequirements?.map((req) => ({
        ...req,
        CriterionId: c.Id,
      })),
    }));

    const payload: Standard = {
      Id: values.id,
      StandardSetId: values.standardSetId,
      Code: values.code.trim(),
      Name: values.name.trim(),
      Description: values.description?.trim() || "",
      Order: values.order,
      Criterions: criterionsWithIds,
      IsEdit: standard?.IsEdit || false,
      IsActived: values.isActived,
      FolderUpload: standard?.FolderUpload || "",
      CreatedBy: standard?.CreatedBy || "",
      CreatedAt: standard?.CreatedAt || "",
      UpdatedAt: standard?.UpdatedAt || "",
    };

    saveChange(payload, isAddMore);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-6xl max-h-[95vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {standard?.IsEdit ? "Cập nhật Tiêu chuẩn" : "Thêm mới Tiêu chuẩn"}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="overflow-y-auto custom-scrollbar flex-1 p-6 bg-slate-50/50 space-y-8">
          <Form {...form}>
            <form id="standard-form" onSubmit={form.handleSubmit((data) => onSubmit(data, false))}>
              {/* Section A: Standard Basic Info */}
              <StandardFormFields
                form={form}
                standardSetOptions={standardSetOptions}
                handleStandardSetChange={handleStandardSetChange}
              />
            </form>
          </Form>

          {/* Section B: Criteria Cards */}
          <CriterionList
            criterions={criterions}
            fileTypeOptions={fileTypeOptions}
            error={errors.criterions}
            onAddCriterion={addCriterion}
            onUpdateCriterion={updateCriterion}
            onDeleteCriterion={deleteCriterion}
            onAddFileRequirement={addFileRequirement}
            onUpdateFileRequirement={updateFileRequirement}
            onDeleteFileRequirement={deleteFileRequirement}
          />
        </div>

        <DialogFooter className="px-6">
          <DialogClose asChild>
            <Button variant="outline" disabled={isLoading} type="button">
              Hủy
            </Button>
          </DialogClose>
          <Button form="standard-form" type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
          {!standard?.IsEdit && (
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
      </DialogContent>
    </Dialog>
  );
};

export default PopupStandard;
