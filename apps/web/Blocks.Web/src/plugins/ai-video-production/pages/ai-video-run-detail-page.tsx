import { AlertCircle, ArrowLeft, FileText, Download, FileJson, FileVideo, FileAudio, FileImage, ShieldAlert } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"
import { createAiVideoApi } from "../api/ai-video-api"
import type { AiVideoRunDetail, AiVideoArtifact } from "../types"

const tokenStore = createBrowserTokenStore()
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/"
const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  getAccessToken: tokenStore.getAccessToken,
})
const aiVideoApi = createAiVideoApi(apiClient)

function buildRawApiUrl(path: string) {
  const absoluteBaseUrl = /^https?:\/\//i.test(apiBaseUrl)
    ? apiBaseUrl
    : new URL(apiBaseUrl, globalThis.location?.origin ?? "http://127.0.0.1").toString()
  const normalizedBaseUrl = absoluteBaseUrl.endsWith("/") ? absoluteBaseUrl : `${absoluteBaseUrl}/`
  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString()
}

async function fetchRawAiVideoArtifact(path: string, accept: string) {
  const headers: Record<string, string> = { Accept: accept }
  const token = tokenStore.getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(buildRawApiUrl(path), { headers })
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as { message?: string; Message?: string } | null
    throw new Error(errorPayload?.message ?? errorPayload?.Message ?? `Artifact request failed with ${response.status}.`)
  }

  return response
}

export function AiVideoRunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [detail, setDetail] = useState<AiVideoRunDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedArtifact, setSelectedArtifact] = useState<AiVideoArtifact | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    if (!runId) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await aiVideoApi.getRunDetail(runId)
      setDetail(response)
      if (response.artifacts && response.artifacts.length > 0) {
        setSelectedArtifact(response.artifacts[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run details.")
    } finally {
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    queueMicrotask(() => void loadDetail())
  }, [loadDetail])

  useEffect(() => {
    let active = true
    let createdObjectUrl: string | null = null
    const fetchPreview = async () => {
      if (!active) return
      if (!selectedArtifact) {
        setPreviewContent(null)
        setPreviewObjectUrl(null)
        return
      }

      const mime = selectedArtifact.mimeType.toLowerCase()
      const isTextOrJson = mime.startsWith("text/") || mime.includes("json")
      setIsPreviewLoading(true)
      setPreviewError(null)
      setPreviewContent(null)
      setPreviewObjectUrl(null)
      try {
        const previewUrl = aiVideoApi.getArtifactPreviewUrl(selectedArtifact.id)
        const response = await fetchRawAiVideoArtifact(previewUrl, isTextOrJson ? "text/plain, application/json, text/html" : selectedArtifact.mimeType)
        const blob = await response.blob()

        if (!active) {
          return
        }

        if (isTextOrJson) {
          setPreviewContent(await blob.text())
        } else {
          createdObjectUrl = URL.createObjectURL(blob)
          setPreviewObjectUrl(createdObjectUrl)
        }
      } catch (err) {
        if (active) {
          setPreviewError(err instanceof Error ? err.message : "Failed to load preview.")
        }
      } finally {
        if (active) {
          setIsPreviewLoading(false)
        }
      }
    }

    queueMicrotask(() => void fetchPreview())

    return () => {
      active = false
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl)
      }
    }
  }, [selectedArtifact])

  const downloadArtifact = useCallback(async (artifact: AiVideoArtifact) => {
    try {
      const response = await fetchRawAiVideoArtifact(aiVideoApi.getArtifactDownloadUrl(artifact.id), artifact.mimeType)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = artifact.locator.split(/[\\/]/).pop() || `${artifact.id}.bin`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to download artifact.")
    }
  }, [])

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error || "Không tìm thấy thông tin tiến trình."}</AlertDescription>
        </Alert>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/plugins/ai-video">
            <ArrowLeft className="mr-2 size-4" /> Quay lại danh sách
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/plugins/ai-video">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight font-mono">{detail.id}</h1>
              <Badge
                className={
                  detail.status.toLowerCase() === "success" || detail.status.toLowerCase() === "completed"
                    ? "bg-emerald-100 text-emerald-800 border-none hover:bg-emerald-100"
                    : detail.status.toLowerCase() === "failed"
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                    : detail.status.toLowerCase() === "running"
                    ? "bg-blue-100 text-blue-800 border-none hover:bg-blue-100"
                    : "bg-secondary text-secondary-foreground"
                }
              >
                {detail.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">Lane: {detail.lane} | Phiên bản Workflow: {detail.workflowVersion}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline các Stage</CardTitle>
              <CardDescription>Trình tự thực thi của các giai đoạn trong workflow sản xuất.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-muted pl-6 space-y-6">
                {detail.timeline.map((stage) => (
                  <div key={stage.stageKey} className="relative">
                    <div
                      className={`absolute -left-[31px] top-1.5 size-4 rounded-full border-2 bg-background ${
                        stage.status.toLowerCase() === "success" || stage.status.toLowerCase() === "completed"
                          ? "border-emerald-500"
                          : stage.status.toLowerCase() === "failed"
                          ? "border-destructive"
                          : stage.status.toLowerCase() === "running"
                          ? "border-blue-500 animate-pulse"
                          : "border-muted"
                      }`}
                    />
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm capitalize">{stage.stageKey.replace(/-/g, " ")}</h4>
                        {stage.attemptId && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">Attempt: {stage.attemptId}</p>
                        )}
                        {stage.startedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Bắt đầu: {new Date(stage.startedAt).toLocaleString("vi-VN")}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          stage.status.toLowerCase() === "success" || stage.status.toLowerCase() === "completed"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                            : stage.status.toLowerCase() === "failed"
                            ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                            : stage.status.toLowerCase() === "running"
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-50"
                            : ""
                        }
                      >
                        {stage.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {detail.reconciliationEvents && detail.reconciliationEvents.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <ShieldAlert className="size-5" />
                    Sự kiện đối soát lỗi (Reconciliation)
                  </CardTitle>
                  <CardDescription>Báo cáo bất thường và sai lệch checksum.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {detail.reconciliationEvents.map((evt) => (
                  <Alert variant="destructive" key={evt.id}>
                    <AlertCircle className="size-4" />
                    <AlertTitle className="capitalize">{evt.stageKey} - {evt.conflictType}</AlertTitle>
                    <AlertDescription className="mt-2 space-y-1">
                      <p>{evt.message}</p>
                      <div className="text-xs font-mono opacity-80 mt-1">
                        <p>Expected: {evt.expectedChecksum}</p>
                        <p>Observed: {evt.observedChecksum}</p>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="flex flex-col h-[600px]">
            <CardHeader>
              <CardTitle>Artifacts liên quan</CardTitle>
              <CardDescription>Các tập tin kết quả được sinh ra.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2">
              {detail.artifacts.map((art) => (
                <div
                  key={art.id}
                  onClick={() => setSelectedArtifact(art)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${
                    selectedArtifact?.id === art.id ? "bg-accent border-primary" : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {art.mimeType.includes("json") ? (
                      <FileJson className="size-5 text-yellow-500" />
                    ) : art.mimeType.includes("video") ? (
                      <FileVideo className="size-5 text-blue-500" />
                    ) : art.mimeType.includes("audio") ? (
                      <FileAudio className="size-5 text-purple-500" />
                    ) : art.mimeType.includes("image") ? (
                      <FileImage className="size-5 text-emerald-500" />
                    ) : (
                      <FileText className="size-5 text-muted-foreground" />
                    )}
                    <div>
                      <h5 className="font-medium text-sm capitalize">{art.logicalType.replace(/-/g, " ")}</h5>
                      <p className="text-xs text-muted-foreground capitalize">{art.stageKey.replace(/-/g, " ")}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${art.logicalType}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void downloadArtifact(art)
                    }}
                  >
                    <Download className="size-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedArtifact && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Xem trước: {selectedArtifact.logicalType}</CardTitle>
              <CardDescription className="font-mono text-xs mt-1">{selectedArtifact.locator}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="border-t pt-6">
            {isPreviewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : previewError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Không thể hiển thị xem trước</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            ) : selectedArtifact.mimeType === "text/html" && previewContent !== null ? (
              <iframe
                title={`Preview ${selectedArtifact.logicalType}`}
                sandbox=""
                srcDoc={previewContent}
                className="h-[400px] w-full rounded-lg border bg-background"
              />
            ) : selectedArtifact.mimeType.startsWith("image/") && previewObjectUrl ? (
              <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                <img
                  src={previewObjectUrl}
                  alt={selectedArtifact.logicalType}
                  className="max-h-[400px] object-contain rounded"
                />
              </div>
            ) : selectedArtifact.mimeType.startsWith("video/") && previewObjectUrl ? (
              <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                <video
                  src={previewObjectUrl}
                  controls
                  className="max-h-[400px] w-full max-w-[600px] rounded"
                />
              </div>
            ) : selectedArtifact.mimeType.startsWith("audio/") && previewObjectUrl ? (
              <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                <audio
                  src={previewObjectUrl}
                  controls
                  className="w-full max-w-[400px]"
                />
              </div>
            ) : previewContent !== null ? (
              <pre className="p-4 bg-muted rounded-lg overflow-x-auto font-mono text-sm max-h-[350px]">
                {previewContent}
              </pre>
            ) : (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>Không hỗ trợ xem trước trực tiếp</AlertTitle>
                <AlertDescription>
                  File thuộc định dạng {selectedArtifact.mimeType}. Hãy tải file về máy để xem.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
