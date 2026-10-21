import { describe, expect, it } from "vitest";
import {
  getSarMetadataPollInterval,
  mergeSarDraftWithMetadata,
} from "./useSar";
import type { SarDraft, SarDraftMetadata } from "../types/sar.types";

describe("getSarMetadataPollInterval", () => {
  it("returns 10000ms when popup is open and cycleId is present", () => {
    expect(getSarMetadataPollInterval(true, "cycle-123")).toBe(10000);
  });

  it("returns false when popup is closed", () => {
    expect(getSarMetadataPollInterval(false, "cycle-123")).toBe(false);
  });

  it("returns false when cycleId is undefined", () => {
    expect(getSarMetadataPollInterval(true, undefined)).toBe(false);
  });

  it("returns false when cycleId is empty string", () => {
    expect(getSarMetadataPollInterval(true, "")).toBe(false);
  });
});

describe("mergeSarDraftWithMetadata", () => {
  const baseDraft: SarDraft = {
    SarReportId: "report-1",
    CycleId: "cycle-1",
    Status: 1,
    ReviewRound: 0,
    CanSubmitByRole: false,
    CanEditByRole: true,
    RevisionReason: null,
    LastSavedAt: "2026-04-18T10:00:00Z",
    UpdatedAt: "2026-04-18T10:00:00Z",
    UpdatedBy: "user-a",
    CreatedAt: "2026-04-18T09:00:00Z",
    CreatedBy: "user-a",
    YDocSnapshotBase64: "heavy-snapshot-data",
    RenderedHtml: "<p>heavy-html-content</p>",
  };

  it("returns null when draft is null", () => {
    const metadata: SarDraftMetadata = {
      SarReportId: "report-1",
      CycleId: "cycle-1",
      Status: 2,
    };
    expect(mergeSarDraftWithMetadata(null, metadata)).toBeNull();
  });

  it("returns draft unchanged when metadata is null", () => {
    expect(mergeSarDraftWithMetadata(baseDraft, null)).toBe(baseDraft);
  });

  it("merges metadata fields into draft without touching heavy content", () => {
    const metadata: SarDraftMetadata = {
      SarReportId: "report-1",
      CycleId: "cycle-1",
      Status: 2,
      ReviewRound: 1,
      CanSubmitByRole: true,
      CanEditByRole: false,
      RevisionReason: "Cần bổ sung minh chứng",
      LastSavedAt: "2026-04-18T12:00:00Z",
      UpdatedAt: "2026-04-18T12:00:00Z",
      UpdatedBy: "user-b",
    };

    const merged = mergeSarDraftWithMetadata(baseDraft, metadata);

    // Metadata fields updated
    expect(merged!.Status).toBe(2);
    expect(merged!.ReviewRound).toBe(1);
    expect(merged!.CanSubmitByRole).toBe(true);
    expect(merged!.CanEditByRole).toBe(false);
    expect(merged!.RevisionReason).toBe("Cần bổ sung minh chứng");
    expect(merged!.LastSavedAt).toBe("2026-04-18T12:00:00Z");
    expect(merged!.UpdatedBy).toBe("user-b");

    // Heavy content preserved
    expect(merged!.YDocSnapshotBase64).toBe("heavy-snapshot-data");
    expect(merged!.RenderedHtml).toBe("<p>heavy-html-content</p>");
  });

  it("does not mutate the original draft object", () => {
    const metadata: SarDraftMetadata = {
      SarReportId: "report-1",
      CycleId: "cycle-1",
      Status: 4,
    };

    const merged = mergeSarDraftWithMetadata(baseDraft, metadata);
    expect(merged).not.toBe(baseDraft);
    expect(baseDraft.Status).toBe(1);
  });
});
