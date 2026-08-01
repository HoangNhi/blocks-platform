import type { ApiClient } from "@/lib/api/client"
import type {
  AiVideoRunListQuery,
  AiVideoRunSummary,
  AiVideoRunDetail,
  AiVideoArtifact,
  AiVideoStatusInfo,
} from "../types"

type AiVideoApiOptions = Pick<ApiClient, "request">

export function createAiVideoApi(client: AiVideoApiOptions) {
  return {
    listRuns: (query?: AiVideoRunListQuery) =>
      client.request<{ items: AiVideoRunSummary[]; totalCount: number }>("/api/ai-video/runs", {
        query: query as Record<string, string | number | boolean | null | undefined>
      }),
    getRunDetail: (runId: string) =>
      client.request<AiVideoRunDetail>(`/api/ai-video/runs/${encodeURIComponent(runId)}`),
    getArtifacts: (runId: string) =>
      client.request<{ items: AiVideoArtifact[] }>(`/api/ai-video/runs/${encodeURIComponent(runId)}/artifacts`),
    getStatus: () =>
      client.request<AiVideoStatusInfo>("/api/ai-video/status"),
    getArtifactPreviewUrl: (artifactId: string) =>
      `/api/ai-video/artifacts/${encodeURIComponent(artifactId)}/preview`,
    getArtifactDownloadUrl: (artifactId: string) =>
      `/api/ai-video/artifacts/${encodeURIComponent(artifactId)}/download`,
  }
}
