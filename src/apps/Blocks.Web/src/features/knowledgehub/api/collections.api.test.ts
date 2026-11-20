import { afterEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import {
  CollectionApiError,
  collectionsApi,
} from "./collections.api";

const id = "11111111-1111-1111-1111-111111111111";
const input = { Name: "Backend", Description: "Notes" };
const dto = {
  Id: id,
  Name: "Backend",
  Description: "Notes",
  CreatedAt: "2026-11-20T00:00:00Z",
  UpdatedAt: "2026-11-20T00:00:00Z",
  DocumentCount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("KnowledgeHub soft HTTP 200 errors", () => {
  it.each([400, 403, 404, 503])(
    "rejects application %s from list instead of treating it as query success",
    async (statusCode) => {
      vi.spyOn(api, "get").mockResolvedValue({
        Success: false,
        StatusCode: statusCode,
        Message: `Error ${statusCode}`,
      } as never);

      await expect(
        collectionsApi.list({ page_index: 1, page_size: 50 }),
      ).rejects.toMatchObject({
        statusCode,
        message: `Error ${statusCode}`,
      } satisfies Partial<CollectionApiError>);
    },
  );

  it("accepts successful PascalCase list payloads", async () => {
    const page = {
      Data: [dto],
      TotalRow: 1,
      PageIndex: 1,
      PageSize: 50,
    };
    const get = vi.spyOn(api, "get").mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: page,
    } as never);

    await expect(
      collectionsApi.list({ page_index: 1, page_size: 50 }),
    ).resolves.toEqual(page);
    expect(get).toHaveBeenCalledWith(API_ENDPOINTS.KnowledgeHub.COLLECTIONS, {
      params: { page_index: 1, page_size: 50 },
      signal: undefined,
    });
  });
});

describe("KnowledgeHub collection API contract", () => {
  it.each([
    ["detail", "get", () => collectionsApi.detail(id), [id]],
    ["create", "post", () => collectionsApi.create(input), [input]],
    ["update", "put", () => collectionsApi.update(id, input), [id, input]],
    ["delete", "delete", () => collectionsApi.remove(id), [id]],
  ] as const)("rejects application errors from %s", async (_name, method, call, args) => {
    const spy = vi.spyOn(api, method).mockResolvedValue({
      Success: false,
      StatusCode: 403,
      Message: "Không có quyền",
    } as never);

    await expect(call()).rejects.toBeInstanceOf(CollectionApiError);
    expect(spy).toHaveBeenCalled();
    expect(args.length).toBeGreaterThan(0);
  });

  it("passes successful create, update, detail and delete payloads through", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: dto,
    } as never);
    vi.spyOn(api, "post").mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: dto,
    } as never);
    vi.spyOn(api, "put").mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: dto,
    } as never);
    vi.spyOn(api, "delete").mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: { Id: id },
    } as never);

    await expect(collectionsApi.detail(id)).resolves.toEqual(dto);
    await expect(collectionsApi.create(input)).resolves.toEqual(dto);
    await expect(collectionsApi.update(id, input)).resolves.toEqual(dto);
    await expect(collectionsApi.remove(id)).resolves.toEqual({ Id: id });
  });
});
