import { useState, useCallback, useMemo } from "react";
import type { Criterion } from "@/features/catalog/types/standard.types";

export const useStandardCriteria = (initialCriterions: Criterion[] = []) => {
  const [criterions, setCriterions] = useState<Criterion[]>(initialCriterions);

  const addCriterion = useCallback((criterion: Criterion) => {
    setCriterions((prev) => [...prev, criterion]);
  }, []);

  const updateCriterion = useCallback((id: string, updates: Partial<Criterion>) => {
    setCriterions((prev) =>
      prev.map((c) => (c.Id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const deleteCriterion = useCallback((id: string) => {
    setCriterions((prev) => prev.filter((c) => c.Id !== id));
  }, []);

  const validateCriterions = useCallback((): boolean => {
    return criterions.every((c) => {
      // Check basic required fields
      if (!c.Code?.trim() || !c.Name?.trim()) {
        return false;
      }

      // Check that criterion has at least one requirement
      if (!c.CriterionRequirements || c.CriterionRequirements.length === 0) {
        return false;
      }

      // Validate all requirements
      return c.CriterionRequirements.every(
        (req) =>
          req.FileTypeId &&
          req.FileTypeId.trim() !== "" &&
          req.MinQuantity >= 0
      );
    });
  }, [criterions]);

  const handlers = useMemo(
    () => ({
      addCriterion,
      updateCriterion,
      deleteCriterion,
      validateCriterions,
    }),
    [addCriterion, updateCriterion, deleteCriterion, validateCriterions]
  );

  return { criterions, setCriterions, handlers };
};
