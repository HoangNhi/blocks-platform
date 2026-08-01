import { describe, it, expect, vi } from "vitest"
import { createAiVideoApi } from "./ai-video-api"

describe("createAiVideoApi", () => {
  it("listRuns passes correct query params and encodes paths", async () => {
    const mockRequest = vi.fn().mockResolvedValue({ items: [], totalCount: 0 })
    const api = createAiVideoApi({ request: mockRequest })

    await api.listRuns({ search: "test", lane: "weekly", status: "success", page: 1, pageSize: 20 })

    expect(mockRequest).toHaveBeenCalledWith("/api/ai-video/runs", {
      query: {
        search: "test",
        lane: "weekly",
        status: "success",
        page: 1,
        pageSize: 20
      }
    })
  })

  it("getRunDetail calls correct path with encoded run ID", async () => {
    const mockRequest = vi.fn().mockResolvedValue({})
    const api = createAiVideoApi({ request: mockRequest })

    await api.getRunDetail("run#123")

    expect(mockRequest).toHaveBeenCalledWith("/api/ai-video/runs/run%23123")
  })

  it("calls status and run artifact endpoints", async () => {
    const mockRequest = vi.fn().mockResolvedValue({})
    const api = createAiVideoApi({ request: mockRequest })

    await api.getStatus()
    await api.getArtifacts("run#123")

    expect(mockRequest).toHaveBeenNthCalledWith(1, "/api/ai-video/status")
    expect(mockRequest).toHaveBeenNthCalledWith(2, "/api/ai-video/runs/run%23123/artifacts")
  })

  it("generates correct preview and download helper URLs", () => {
    const mockRequest = vi.fn()
    const api = createAiVideoApi({ request: mockRequest })

    const previewUrl = api.getArtifactPreviewUrl("uuid-123")
    const downloadUrl = api.getArtifactDownloadUrl("uuid-123")

    expect(previewUrl).toBe("/api/ai-video/artifacts/uuid-123/preview")
    expect(downloadUrl).toBe("/api/ai-video/artifacts/uuid-123/download")
  })
})
