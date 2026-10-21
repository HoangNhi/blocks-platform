import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Council, Cycle, EvaluationSchedule } from "@/features/business/types/cycle.types";
import { userService } from "@/features/system/api/user.api";
import { standardService, type StandardOption } from "@/features/catalog/api/standard.api";

interface UseCycleFormProps {
    cycle: Cycle | null;
    isOpen: boolean;
    saveChange: (cycle: Cycle, isAddMore: boolean) => void;
}

export function useCycleForm({ cycle, isOpen, saveChange }: UseCycleFormProps) {
    const [formData, setFormData] = useState({
        id: cycle?.Id || uuidv4(),
        name: cycle?.Name || "",
        year: cycle?.Year?.toString() || new Date().getFullYear().toString(),
        startDate: cycle?.StartDate
            ? format(new Date(cycle.StartDate), "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd"),
        endDate: cycle?.EndDate
            ? format(new Date(cycle.EndDate), "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd"),
        status: cycle?.Status?.toString() || "1",
        scope: cycle?.Scope?.toString() || "1",
        evaluationPurpose: cycle?.EvaluationPurpose || "",
        standardSetId: cycle?.StandardSetId || "",
    });

    const [listCouncil, setListCouncil] = useState<Council[]>(
        (cycle?.ListCouncil || []).map((c) => ({
            ...c,
            AssignedStandardIds: c.AssignedStandardIds ?? [],
        })),
    );
    const [listEvaluationSchedule, setListEvaluationSchedule] = useState<
        EvaluationSchedule[]
    >(cycle?.ListEvaluationSchedule || []);

    const [standards, setStandards] = useState<StandardOption[]>([]);

    const [errors, setErrors] = useState<{
        name?: string;
        year?: string;
        startDate?: string;
        endDate?: string;
        listCouncil?: string;
        listEvaluationSchedule?: string;
        standardSetId?: string;
        evaluationPurpose?: string;
    }>({});

    const { data: userResponse } = useQuery({
        queryKey: ["users", "combobox"],
        queryFn: () => userService.getAllCombobox(),
        enabled: isOpen,
    });
    const userOptions = useMemo(
        () => (userResponse?.Data ?? []).map((u: any) => ({
            Value: u.Value ?? u.value ?? "",
            Text: u.Text ?? u.text ?? "",
        })),
        [userResponse?.Data],
    );

    useEffect(() => {
        if (!formData.standardSetId) {
            setStandards([]);
            return;
        }
        standardService
            .getByStandardSetId(formData.standardSetId)
            .then((res) => setStandards(res.Data ?? []))
            .catch(() => setStandards([]));
    }, [formData.standardSetId]);

    useEffect(() => {
        if (cycle) {
            setFormData({
                id: cycle.Id || uuidv4(),
                name: cycle.Name || "",
                year: cycle.Year?.toString() || new Date().getFullYear().toString(),
                startDate: cycle.StartDate
                    ? format(new Date(cycle.StartDate), "yyyy-MM-dd")
                    : format(new Date(), "yyyy-MM-dd"),
                endDate: cycle.EndDate
                    ? format(new Date(cycle.EndDate), "yyyy-MM-dd")
                    : format(new Date(), "yyyy-MM-dd"),
                status: cycle.Status?.toString() || "1",
                scope: cycle.Scope?.toString() || "1",
                evaluationPurpose: cycle.EvaluationPurpose || "",
                standardSetId: cycle.StandardSetId || "",
            });
            setListCouncil(
                (cycle.ListCouncil || []).map((c) => ({
                    ...c,
                    AssignedStandardIds: c.AssignedStandardIds ?? [],
                })),
            );
            setListEvaluationSchedule(cycle.ListEvaluationSchedule || []);
            setErrors({});
        }
    }, [cycle]);

    const updateField = <K extends keyof typeof formData>(
        field: K,
        value: (typeof formData)[K],
    ) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field as keyof typeof errors]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const handleYearChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newYear = e.target.value;
            if (!/^\d*$/.test(newYear)) return;
            if (newYear !== "" && parseInt(newYear) <= 0) return;
            setFormData((prev) => {
                const updated = { ...prev, year: newYear };
                if (newYear && newYear.length === 4) {
                    const y = parseInt(newYear);
                    if (!isNaN(y)) {
                        if (prev.startDate) {
                            const d = new Date(prev.startDate);
                            d.setFullYear(y);
                            updated.startDate = format(d, "yyyy-MM-dd");
                        }
                        if (prev.endDate) {
                            const d = new Date(prev.endDate);
                            d.setFullYear(y);
                            updated.endDate = format(d, "yyyy-MM-dd");
                        }
                    }
                }
                return updated;
            });
            if (errors.year) {
                setErrors((prev) => ({ ...prev, year: undefined }));
            }
        },
        [errors.year],
    );

    const handleAddCouncil = useCallback(() => {
        setListCouncil((prev) => [
            ...prev,
            {
                Id: uuidv4(),
                CycleId: "",
                UserId: "",
                RoleId: 4,
                AssignedStandardIds: [],
                IsActived: true,
                IsEdit: false,
                FolderUpload: "",
            },
        ]);
    }, []);

    const handleDeleteCouncil = useCallback((id: string) => {
        setListCouncil((prev) => prev.filter((x) => x.Id !== id));
    }, []);

    const handleChangeCouncil = useCallback(
        (
            id: string,
            field: keyof Council,
            value: string | number | boolean | string[],
        ) => {
            setListCouncil((prev) =>
                prev.map((c) => (c.Id === id ? { ...c, [field]: value } : c)),
            );
        },
        [],
    );

    const handleAddEvaluationSchedule = useCallback(() => {
        setListEvaluationSchedule((prev) => [
            ...prev,
            {
                Id: uuidv4(),
                CycleId: "",
                ActivityName: "",
                StartTime: format(new Date(), "yyyy-MM-dd"),
                EndTime: format(new Date(), "yyyy-MM-dd"),
                LeadId: "",
                IsActived: true,
                IsEdit: false,
                FolderUpload: "",
            },
        ]);
    }, []);

    const handleDeleteEvaluationSchedule = useCallback((id: string) => {
        setListEvaluationSchedule((prev) => prev.filter((x) => x.Id !== id));
    }, []);

    const handleChangeEvaluationSchedule = useCallback(
        (id: string, field: keyof EvaluationSchedule, value: string) => {
            setListEvaluationSchedule((prev) =>
                prev.map((c) => (c.Id === id ? { ...c, [field]: value } : c)),
            );
        },
        [],
    );

    const d15 = useMemo(() => {
        const totalMembers = listCouncil.length;
        const evaluatorCounts: Record<string, number> = {};
        const providerCounts: Record<string, number> = {};

        for (const s of standards) {
            evaluatorCounts[s.Id] = 0;
            providerCounts[s.Id] = 0;
        }

        for (const m of listCouncil) {
            const role = Number(m.RoleId);
            const effectiveIds =
                role === 1
                    ? standards.map((s) => s.Id)
                    : (m.AssignedStandardIds ?? []);

            if (role === 4 || role === 2) {
                for (const id of effectiveIds) {
                    evaluatorCounts[id] = (evaluatorCounts[id] ?? 0) + 1;
                }
            }
            if (role === 5) {
                for (const id of effectiveIds) {
                    providerCounts[id] = (providerCounts[id] ?? 0) + 1;
                }
            }
        }

        const insufficientEval = standards.filter(
            (s) => (evaluatorCounts[s.Id] ?? 0) < 3,
        );
        const uncoveredProvider = standards.filter(
            (s) => (providerCounts[s.Id] ?? 0) === 0,
        );

        return {
            totalMembers,
            enoughMembers: totalMembers >= 9,
            evaluatorCounts,
            providerCounts,
            insufficientEval,
            uncoveredProvider,
        };
    }, [listCouncil, standards]);

    const validateForm = (): boolean => {
        const newErrors: typeof errors = {};

        if (!formData.name.trim()) {
            newErrors.name = "Tên chu kỳ không được để trống";
        }

        if (!formData.year.trim() || isNaN(parseInt(formData.year))) {
            newErrors.year = "Năm phải là số hợp lệ";
        } else if (parseInt(formData.year) <= 0) {
            newErrors.year = "Năm phải là số dương";
        }

        if (!formData.startDate) {
            newErrors.startDate = "Ngày bắt đầu không được để trống";
        }

        if (!formData.endDate) {
            newErrors.endDate = "Ngày kết thúc không được để trống";
        }

        if (
            formData.startDate &&
            formData.endDate &&
            formData.startDate > formData.endDate
        ) {
            newErrors.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
            toast.error("Ngày kết thúc phải sau ngày bắt đầu");
        }

        if (listCouncil.some((c) => !c.UserId)) {
            newErrors.listCouncil = "Tất cả thành viên hội đồng phải được chọn";
            toast.error("Tất cả thành viên hội đồng phải được chọn");
        }

        if (listEvaluationSchedule.some((s) => !s.ActivityName.trim())) {
            newErrors.listEvaluationSchedule = "Tất cả hoạt động phải có tên";
            toast.error("Tất cả hoạt động phải có tên");
        }

        if (formData.standardSetId.trim() === "") {
            newErrors.standardSetId = "Bộ tiêu chuẩn không được để trống";
        }

        if (formData.evaluationPurpose.trim() === "") {
            newErrors.evaluationPurpose = "Mục đích đánh giá không được để trống";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const onSubmit = (isAddMore: boolean) => {
        if (!validateForm()) return;

        saveChange(
            {
                Id: formData.id,
                Name: formData.name.trim(),
                Year: parseInt(formData.year),
                StartDate: formData.startDate,
                EndDate: formData.endDate,
                Status: formData.status,
                EvaluationPurpose: formData.evaluationPurpose,
                StandardSetId: formData.standardSetId,
                Scope: parseInt(formData.scope),
                IsEdit: cycle?.IsEdit || false,
                IsActived: cycle?.IsActived ?? true,
                FolderUpload: cycle?.FolderUpload || "",
                ListCouncil: listCouncil.map((c) => ({
                    ...c,
                    CycleId: formData.id,
                })),
                ListEvaluationSchedule: listEvaluationSchedule.map((s) => ({
                    ...s,
                    CycleId: formData.id,
                })),
            },
            isAddMore,
        );
    };

    return {
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
    };
}
