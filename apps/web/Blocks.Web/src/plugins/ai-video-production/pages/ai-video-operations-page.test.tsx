// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AiVideoOperationsPage } from "./ai-video-operations-page"

vi.mock("../api/ai-video-api", () => {
  return {
    createAiVideoApi: vi.fn(() => ({
      listRuns: vi.fn().mockResolvedValue({
        items: [
          {
            id: "run-1",
            lane: "weekly",
            status: "success",
            windowStart: "2026-07-24T10:00:00",
            windowEnd: "2026-07-24T11:00:00",
            workflowVersion: "1.0",
            importedAt: "2026-07-24T12:00:00"
          }
        ],
        totalCount: 1
      }),
      getStatus: vi.fn().mockResolvedValue({
        isHealthy: true,
        importedRunCount: 1,
        artifactCount: 1,
        importBatchCount: 1,
        workerStatus: "Unknown",
        providerConfigurationStatus: "Unknown"
      })
    }))
  }
})

describe("AiVideoOperationsPage", () => {
  it("renders operations overview runs and displays empty/populates correctly", async () => {
    render(
      <MemoryRouter>
        <AiVideoOperationsPage />
      </MemoryRouter>
    )

    expect(screen.getByText("AI Video Production")).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText("run-1")).toBeTruthy()
      expect(screen.getByText("weekly")).toBeTruthy()
      expect(screen.getByText("success")).toBeTruthy()
    })
  })
})
