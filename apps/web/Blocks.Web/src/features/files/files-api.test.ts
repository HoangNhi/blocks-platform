import { describe, expect, it, vi } from "vitest"

import type { ApiClient } from "@/lib/api/client"

import { createFilesApi } from "./files-api"

function createFile(name = "report.txt") {
  return new File(["hello"], name, { type: "text/plain" })
}

function createApiClient(response: unknown): ApiClient {
  return {
    request: vi.fn(async () => response),
  } as unknown as ApiClient
}

describe("files api", () => {
  it("uploads files to File Service embed endpoint as FormData", async () => {
    const client = createApiClient([
      {
        Id: "attachment-1",
        ReferenceType: 0,
        RelatedId: "00000000-0000-0000-0000-000000000000",
        FileName: "report",
        FileExtension: ".txt",
        FileSize: 5,
        FileUrl: "sar-embeds/phase3-smoke/attachment-1/report.txt",
        FullFileName: "report.txt",
      },
    ])
    const api = createFilesApi(client)

    const result = await api.uploadEmbedded({
      folderName: "phase3-smoke",
      files: [createFile()],
    })

    expect(client.request).toHaveBeenCalledWith(
      "/api/files/UploadFile/embed",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    )

    const requestOptions = vi.mocked(client.request).mock.calls[0]?.[1]
    const body = requestOptions?.body as FormData

    expect(body.get("FolderName")).toBe("phase3-smoke")
    expect(body.getAll("files")).toHaveLength(1)
    expect(result).toEqual([
      {
        id: "attachment-1",
        referenceType: 0,
        relatedId: "00000000-0000-0000-0000-000000000000",
        fileName: "report",
        fileExtension: ".txt",
        fileSize: 5,
        fileUrl: "sar-embeds/phase3-smoke/attachment-1/report.txt",
        fullFileName: "report.txt",
      },
    ])
  })

  it("uploads temporary files to File Service root endpoint as FormData", async () => {
    const client = createApiClient(true)
    const api = createFilesApi(client)

    await api.uploadTemporary({
      folderName: "avatar-upload",
      files: [createFile("avatar.png")],
    })

    expect(client.request).toHaveBeenCalledWith(
      "/api/files/UploadFile",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    )

    const requestOptions = vi.mocked(client.request).mock.calls[0]?.[1]
    const body = requestOptions?.body as FormData
    expect(body.get("FolderName")).toBe("avatar-upload")
    expect(body.getAll("files")).toHaveLength(1)
  })

  it("normalizes camelCase attachment rows", async () => {
    const api = createFilesApi(
      createApiClient([
        {
          id: "attachment-2",
          referenceType: 1,
          relatedId: "related-1",
          fileName: "avatar",
          fileExtension: ".png",
          fileSize: 12,
          fileUrl: "System/Avatar/avatar.png",
          fullFileName: "avatar.png",
        },
      ]),
    )

    const result = await api.uploadEmbedded({
      folderName: "avatar-upload",
      files: [createFile("avatar.png")],
    })

    expect(result[0]?.fileUrl).toBe("System/Avatar/avatar.png")
  })

  it("rejects unsafe folder names before sending", async () => {
    const client = createApiClient([])
    const api = createFilesApi(client)

    await expect(
      api.uploadEmbedded({
        folderName: "../avatars",
        files: [createFile()],
      }),
    ).rejects.toThrow("Folder name cannot contain path traversal or separators.")

    expect(client.request).not.toHaveBeenCalled()
  })

  it("rejects empty file lists before sending", async () => {
    const client = createApiClient([])
    const api = createFilesApi(client)

    await expect(
      api.uploadEmbedded({
        folderName: "empty",
        files: [],
      }),
    ).rejects.toThrow("At least one file is required.")

    expect(client.request).not.toHaveBeenCalled()
  })
})
