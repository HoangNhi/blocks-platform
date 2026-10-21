import { describe, expect, it } from "vitest";
import {
  canSubmitSar,
  createSarCollabSessionKey,
  createSarEvidencePreviewCycleMap,
  createSarEvidencePreviewQueryKey,
  createSarEvidenceListRequest,
  findEvidenceCycleMapIdByEvidenceId,
  getSarRightPanelTabs,
  isSarEditorReadOnly,
  resolveSarEvidencePreviewCycleMapId,
  shouldShowSarRevisionReasonBanner,
} from "./PopupSarEditor";

describe("PopupSarEditor workflow helpers", () => {
  const baseEvidence = {
    Id: "ev-2",
    Name: "Evidence 2",
    Code: "EV-2",
    Status: 3,
    FileTypeId: "file-type-1",
    IsEdit: false,
    IsActived: true,
    CycleId: "workflow-cycle",
  };

  it.each([
    [1, false],
    [2, true],
    [3, false],
    [4, true],
  ] as const)("marks status %s as read-only=%s", (status, expected) => {
    expect(isSarEditorReadOnly(status)).toBe(expected);
  });

  it.each([
    [1, true, false],
    [1, false, true],
    [2, true, true],
    [2, false, true],
    [3, true, false],
    [3, false, true],
    [4, true, true],
    [4, false, true],
  ] as const)(
    "combines status %s with canEditByRole=%s into isReadOnly=%s",
    (status, canEditByRole, expected) => {
      const isReadOnly = isSarEditorReadOnly(status) || !canEditByRole;
      expect(isReadOnly).toBe(expected);
    },
  );

  it.each([
    [1, true, true],
    [1, false, false],
    [2, true, false],
    [3, true, true],
    [3, false, false],
    [4, true, false],
  ] as const)(
    "allows submit for status %s with role permission %s => %s",
    (status, canSubmitByRole, expected) => {
      expect(canSubmitSar(status, canSubmitByRole)).toBe(expected);
    },
  );

  it.each([
    [3, "Need more evidence.", true],
    [3, "   ", false],
    [2, "Need more evidence.", false],
    [4, "Need more evidence.", false],
    [3, null, false],
  ] as const)(
    "shows revision banner for status %s and reason %s => %s",
    (status, revisionReason, expected) => {
      expect(shouldShowSarRevisionReasonBanner(status, revisionReason)).toBe(expected);
    },
  );

  it("builds the verified evidence query for the current SAR cycle", () => {
    expect(createSarEvidenceListRequest("cycle-123")).toEqual({
      PageIndex: 1,
      PageSize: 1000,
      TextSearch: "",
      CycleId: "cycle-123",
      EvidenceStatus: 3,
    });
  });

  it("builds distinct preview keys when verified evidence mappings change", () => {
    const basePreviewKey = createSarEvidencePreviewQueryKey("ev-2", [
      { Id: "map-1", EvidenceId: "ev-1" },
      { Id: "map-2", EvidenceId: "ev-2" },
    ]);
    const changedPreviewKey = createSarEvidencePreviewQueryKey("ev-2", [
      { Id: "map-1", EvidenceId: "ev-1" },
      { Id: "map-9", EvidenceId: "ev-2" },
    ]);

    expect(basePreviewKey).not.toEqual(changedPreviewKey);
  });

  it("finds the verified evidence mapping id by evidence id", () => {
    expect(
      findEvidenceCycleMapIdByEvidenceId(
        [
          { Id: "map-1", EvidenceId: "ev-1" },
          { Id: "map-2", EvidenceId: "ev-2" },
        ],
        "ev-2",
      ),
    ).toBe("map-2");
  });

  it("throws a clear error when the evidence id is missing from verified evidences", () => {
    expect(() =>
      resolveSarEvidencePreviewCycleMapId(
        [
          { Id: "map-1", EvidenceId: "ev-1" },
          { Id: "map-2", EvidenceId: "ev-2" },
        ],
        "ev-missing",
      ),
    ).toThrowError(/minh chứng đã xác minh để xem trước/i);
  });

  it("normalizes a workflow preview while preserving SAR context", () => {
    expect(
      createSarEvidencePreviewCycleMap(
        {
          Id: "map-2",
          EvidenceId: "ev-2",
          CycleId: "workflow-cycle",
          ReviewStatus: 3,
          Evidence: baseEvidence,
          IsEdit: false,
          IsActived: true,
        },
        "sar-cycle-123",
      ),
    ).toEqual({
      Id: "map-2",
      EvidenceId: "ev-2",
      CycleId: "sar-cycle-123",
      ReviewStatus: 3,
      IsActived: true,
      Evidence: {
        ...baseEvidence,
        CycleId: "sar-cycle-123",
      },
      IsEdit: true,
    });
  });

  it.each([
    [3, ["comments", "evidence"]],
    [1, ["evidence"]],
    [2, ["evidence"]],
    [4, ["evidence"]],
  ] as const)(
    "returns the expected right panel tabs for status %s",
    (status, expectedTabs) => {
      expect(getSarRightPanelTabs(status)).toEqual(expectedTabs);
    },
  );

  describe("createSarCollabSessionKey", () => {
    it("produces a stable key from roomName and reportId", () => {
      const key = createSarCollabSessionKey("sar_cycle_abc", "report-123");
      expect(key).toBe("sar_cycle_abc:report-123");
    });

    it("uses fallback when reportId is null", () => {
      const key = createSarCollabSessionKey("sar_cycle_abc", null);
      expect(key).toBe("sar_cycle_abc:no-report");
    });

    it("returns the same key for the same inputs (stability)", () => {
      const key1 = createSarCollabSessionKey("sar_cycle_x", "id-1");
      const key2 = createSarCollabSessionKey("sar_cycle_x", "id-1");
      expect(key1).toBe(key2);
    });

    it("returns different keys for different reportIds", () => {
      const key1 = createSarCollabSessionKey("sar_cycle_x", "id-1");
      const key2 = createSarCollabSessionKey("sar_cycle_x", "id-2");
      expect(key1).not.toBe(key2);
    });
  });
});
