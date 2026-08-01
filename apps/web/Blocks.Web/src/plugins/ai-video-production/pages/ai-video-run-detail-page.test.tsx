// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { AiVideoRunDetailPage } from "./ai-video-run-detail-page"

vi.mock("../api/ai-video-api", () => {
  return {
    createAiVideoApi: vi.fn(() => ({
      getRunDetail: vi.fn().mockResolvedValue({
        id: "run-detail-test",
        lane: "weekly",
        status: "success",
        windowStart: "2026-07-24T10:00:00",
        windowEnd: "2026-07-24T11:00:00",
        workflowVersion: "1.0",
        contractVersion: "1.0",
        correlationId: "correlation-id",
        importedAt: "2026-07-24T12:00:00",
        timeline: [
          {
            stageKey: "collect-news",
            attemptId: "run-detail-test-att-1",
            status: "success",
            startedAt: "2026-07-24T10:05:00",
            completedAt: "2026-07-24T10:10:00"
          },
          {
            stageKey: "build-weekly-corpus",
            attemptId: null,
            status: "Unknown",
            startedAt: null,
            completedAt: null
          }
        ],
        artifacts: [
          {
            id: "artifact-id-1",
            stageKey: "collect-news",
            logicalType: "raw-news",
            storageKey: "s3://bucket/raw.json",
            mimeType: "application/json",
            sizeInBytes: 100,
            confidence: "high",
            version: 1,
            locator: "collect-news/raw.json"
          }
        ],
        reconciliationEvents: []
      }),
      getArtifactPreviewUrl: vi.fn((id) => `/api/ai-video/artifacts/${id}/preview`),
      getArtifactDownloadUrl: vi.fn((id) => `/api/ai-video/artifacts/${id}/download`)
    }))
  }
})

describe("AiVideoRunDetailPage", () => {
  it("renders run detail page, stages, artifacts and unknown stages correctly", async () => {
    render(
      <MemoryRouter initialEntries={["/plugins/ai-video/runs/run-detail-test"]}>
        <Routes>
          <Route path="/plugins/ai-video/runs/:runId" element={<AiVideoRunDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText("run-detail-test")).toBeTruthy()
      expect(screen.getAllByText(/weekly/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/collect news/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/build weekly corpus/i)).toBeTruthy()
      expect(screen.getByText("Unknown")).toBeTruthy()
      expect(screen.getByText(/raw news/i)).toBeTruthy()
    })
  })
})
