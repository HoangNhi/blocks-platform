import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import { standardService } from "@/features/catalog/api/standard.api";
import type { StandardSet } from "@/features/catalog/types/standardset.types";
import type { Standard } from "@/features/catalog/types/standard.types";

interface TabData {
  standards: Standard[] | null; // null = not loaded yet
  loading: boolean;
  error: string | null;
}

export const useMultiStandardSets = (selectedFileTypeId?: string) => {
  const [standardSets, setStandardSets] = useState<StandardSet[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [tabDataMap, setTabDataMap] = useState<Record<string, TabData>>({});

  // Track which fileTypeId was used to load each tab's data
  const loadedFileTypeRef = useRef<Record<string, string | undefined>>({});

  // Fetch all standard sets on mount
  useEffect(() => {
    const fetchStandardSets = async () => {
      setInitialLoading(true);
      try {
        const res = await standardSetService.getList({
          PageIndex: 1,
          PageSize: 100,
          TextSearch: "",
          IsActived: true,
        });

        if (res.Success && res.Data?.Data) {
          const sets = res.Data.Data;
          setStandardSets(sets);
          if (sets.length > 0) {
            setActiveTabId(sets[0].Id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch standard sets:", error);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchStandardSets();
  }, []);

  // Invalidate cache when selectedFileTypeId changes
  useEffect(() => {
    setTabDataMap({});
    loadedFileTypeRef.current = {};
  }, [selectedFileTypeId]);

  // Load criteria for a specific tab
  const loadTabCriteria = useCallback(
    async (standardSetId: string) => {
      // Skip if already loaded with current fileTypeId or currently loading
      if (
        loadedFileTypeRef.current[standardSetId] === selectedFileTypeId &&
        tabDataMap[standardSetId]?.standards !== null
      ) {
        return;
      }
      if (tabDataMap[standardSetId]?.loading) {
        return;
      }

      setTabDataMap((prev) => ({
        ...prev,
        [standardSetId]: { standards: null, loading: true, error: null },
      }));

      try {
        const res = await standardService.getListWithCriteria({
          StandardSetId: standardSetId,
        });

        if (res.Success) {
          loadedFileTypeRef.current[standardSetId] = selectedFileTypeId;
          setTabDataMap((prev) => ({
            ...prev,
            [standardSetId]: {
              standards: (res.Data || []) as Standard[],
              loading: false,
              error: null,
            },
          }));
        } else {
          setTabDataMap((prev) => ({
            ...prev,
            [standardSetId]: {
              standards: null,
              loading: false,
              error: "Không thể tải tiêu chí",
            },
          }));
        }
      } catch {
        setTabDataMap((prev) => ({
          ...prev,
          [standardSetId]: {
            standards: null,
            loading: false,
            error: "Không thể tải tiêu chí",
          },
        }));
      }
    },
    [selectedFileTypeId, tabDataMap],
  );

  // Auto-load when active tab changes
  useEffect(() => {
    if (activeTabId) {
      loadTabCriteria(activeTabId);
    }
  }, [activeTabId, loadTabCriteria]);

  // Compute per-tab matching stats
  const tabStats = useMemo(() => {
    const stats: Record<string, { total: number; matching: number }> = {};

    for (const [id, data] of Object.entries(tabDataMap)) {
      if (!data.standards) {
        stats[id] = { total: 0, matching: 0 };
        continue;
      }

      const allCriteria = data.standards.flatMap((s) => s.Criterions || []);
      const matching = selectedFileTypeId
        ? allCriteria.filter((c) =>
            c.CriterionRequirements?.some(
              (r) => r.FileTypeId === selectedFileTypeId,
            ),
          )
        : [];

      stats[id] = { total: allCriteria.length, matching: matching.length };
    }

    return stats;
  }, [tabDataMap, selectedFileTypeId]);

  // Compute global stats across all loaded tabs
  const globalStats = useMemo(() => {
    let totalMatching = 0;
    let setsWithMatches = 0;

    for (const stat of Object.values(tabStats)) {
      totalMatching += stat.matching;
      if (stat.matching > 0) setsWithMatches++;
    }

    return { totalMatching, setsWithMatches };
  }, [tabStats]);

  return {
    standardSets,
    activeTabId,
    setActiveTabId,
    initialLoading,
    tabDataMap,
    tabStats,
    globalStats,
  };
};
