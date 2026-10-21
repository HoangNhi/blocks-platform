import { useState, useCallback } from "react";
import type { CriterionRequirement } from "@/features/catalog/types/standard.types";

export const useCriterionRequirements = (
  initialRequirements: CriterionRequirement[] = [],
) => {
  const [requirements, setRequirements] =
    useState<CriterionRequirement[]>(initialRequirements);

  const addRequirement = useCallback((requirement: CriterionRequirement) => {
    setRequirements((prev) => [...prev, requirement]);
  }, []);

  const updateRequirement = useCallback(
    (id: string, updates: Partial<CriterionRequirement>) => {
      setRequirements((prev) =>
        prev.map((req) => (req.Id === id ? { ...req, ...updates } : req)),
      );
    },
    [],
  );

  const deleteRequirement = useCallback((id: string) => {
    setRequirements((prev) => prev.filter((req) => req.Id !== id));
  }, []);

  const validateRequirements = useCallback((): boolean => {
    if (requirements.length === 0) {
      return false;
    }

    return requirements.every(
      (req) =>
        req.FileTypeId &&
        req.FileTypeId.trim() !== "" &&
        req.MinQuantity >= 0,
    );
  }, [requirements]);

  return {
    requirements,
    setRequirements,
    handlers: {
      addRequirement,
      updateRequirement,
      deleteRequirement,
      validateRequirements,
    },
  };
};
