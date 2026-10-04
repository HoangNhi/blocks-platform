// @vitest-environment jsdom
import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ actorId: "owner-1" as string | null, storedActorId: "owner-1" as string | null, request: vi.fn() }))
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ currentUser: mocks.actorId ? { id: mocks.actorId } : null, status: mocks.actorId ? "authenticated" : "anonymous" }) }))
vi.mock("@/features/auth/token-store", () => ({ AUTH_SESSION_KEY: "blocks.auth.session", createBrowserTokenStore: () => ({ getAccessToken: () => "token", getSession: () => mocks.storedActorId ? { user: { id: mocks.storedActorId } } : null }) }))
vi.mock("@/lib/api/client", () => ({ createApiClient: () => ({ request: mocks.request }) }))

import { clearWorkspaceContext, getActiveWorkspaceId } from "../api/workspace-context"
import { TradeLabWorkspaceBoundary } from "./tradelab-workspace-boundary"

function Workbench() {
  const [draft, setDraft] = useState("")
  return <input aria-label="Strategy draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
}

function renderWorkspace() {
  return render(<TradeLabWorkspaceBoundary><Workbench /></TradeLabWorkspaceBoundary>)
}

describe("TradeLab workspace boundary", () => {
  beforeEach(() => {
    clearWorkspaceContext()
    mocks.actorId = "owner-1"
    mocks.storedActorId = "owner-1"
    mocks.request.mockReset().mockResolvedValue([{ id: "ws-1", name: "Personal" }])
    vi.spyOn(window, "confirm").mockReturnValue(true)
  })

  it("gates workbench until membership resolves and auto-selects exactly one workspace", async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.request.mockReturnValue(new Promise((done) => { resolve = done }))
    renderWorkspace()
    expect(screen.getByRole("status").textContent).toContain("Đang tải workspace")
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
    await act(async () => resolve([{ id: "ws-1", name: "Personal" }]))
    expect(screen.getByLabelText("Strategy draft")).not.toBeNull()
    expect(getActiveWorkspaceId()).toBe("ws-1")
  })

  it("keeps fetch error distinct from empty membership and retries explicitly", async () => {
    mocks.request.mockRejectedValueOnce(new Error("Authority unavailable"))
    renderWorkspace()
    expect((await screen.findByRole("alert")).textContent).toContain("Authority unavailable")
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }))
    await screen.findByLabelText("Strategy draft")
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })

  it("shows no-workspace state without mounting private workbench", async () => {
    mocks.request.mockResolvedValue([])
    renderWorkspace()
    expect((await screen.findByRole("status")).textContent).toContain("Chưa có workspace")
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
    expect(getActiveWorkspaceId()).toBeNull()
  })

  it("requires explicit selection and resets draft when workspace changes", async () => {
    mocks.request.mockResolvedValue([{ id: "ws-1", name: "Personal" }, { id: "ws-2", name: "Team" }])
    renderWorkspace()
    const select = await screen.findByRole("combobox", { name: "Workspace TradeLab" })
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole("option", { name: "Personal" }))
    fireEvent.change(screen.getByLabelText("Strategy draft"), { target: { value: "unsaved source" } })
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole("option", { name: "Team" }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText("Strategy draft") as HTMLInputElement).value).toBe("")
    expect(getActiveWorkspaceId()).toBe("ws-2")
  })

  it("keeps draft and workspace when user declines switch", async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    mocks.request.mockResolvedValue([{ id: "ws-1", name: "Personal" }, { id: "ws-2", name: "Team" }])
    renderWorkspace()
    const select = await screen.findByRole("combobox", { name: "Workspace TradeLab" })
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole("option", { name: "Personal" }))
    fireEvent.change(screen.getByLabelText("Strategy draft"), { target: { value: "unsaved" } })
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole("option", { name: "Team" }))
    expect(getActiveWorkspaceId()).toBe("ws-1")
    expect((screen.getByLabelText("Strategy draft") as HTMLInputElement).value).toBe("unsaved")
  })

  it("clears private context on logout and prevents late membership restoring it", async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.request.mockReturnValue(new Promise((done) => { resolve = done }))
    const view = renderWorkspace()
    mocks.actorId = null
    mocks.storedActorId = null
    view.rerender(<TradeLabWorkspaceBoundary><Workbench /></TradeLabWorkspaceBoundary>)
    await act(async () => resolve([{ id: "ws-1", name: "Old user" }]))
    expect(getActiveWorkspaceId()).toBeNull()
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
  })

  it("refetches membership on actor change and discards previous actor response", async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.request.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const view = renderWorkspace()
    mocks.actorId = "owner-2"
    mocks.storedActorId = "owner-2"
    mocks.request.mockResolvedValue([{ id: "ws-2", name: "Next user" }])
    view.rerender(<TradeLabWorkspaceBoundary><Workbench /></TradeLabWorkspaceBoundary>)
    await waitFor(() => expect(getActiveWorkspaceId()).toBe("ws-2"))
    await act(async () => resolve([{ id: "ws-1", name: "Old user" }]))
    expect(getActiveWorkspaceId()).toBe("ws-2")
  })

  it("hides workbench immediately when another tab clears signed-in session", async () => {
    renderWorkspace()
    await screen.findByLabelText("Strategy draft")
    mocks.storedActorId = null
    fireEvent(window, new StorageEvent("storage", { key: "blocks.auth.session" }))
    expect(screen.queryByLabelText("Strategy draft")).toBeNull()
    expect(getActiveWorkspaceId()).toBeNull()
  })

  it("preserves draft and scope for same-actor session refresh in another tab", async () => {
    renderWorkspace()
    fireEvent.change(await screen.findByLabelText("Strategy draft"), { target: { value: "unsaved" } })
    fireEvent(window, new StorageEvent("storage", { key: "blocks.auth.session" }))
    expect((screen.getByLabelText("Strategy draft") as HTMLInputElement).value).toBe("unsaved")
    expect(getActiveWorkspaceId()).toBe("ws-1")
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
})
