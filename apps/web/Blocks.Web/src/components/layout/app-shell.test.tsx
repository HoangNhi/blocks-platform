// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantApi } from "@/features/assistant/assistant-api";
import type { AuthUser } from "@/features/auth/types";
import { navigationFixture } from "@/features/navigation/fixtures";

import { AppShell } from "./app-shell";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const currentUser: AuthUser = {
  id: "admin",
  username: "admin",
  fullname: "Admin User",
  roleId: "admin-role",
  roleName: "Administrator",
  email: "admin@example.test",
  avatar: null,
};

function renderShell(initialEntry = "/", assistantApi?: AssistantApi) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={
            <AppShell
              navigation={navigationFixture}
              currentUser={currentUser}
              onLogout={vi.fn()}
              onEditProfile={vi.fn()}
              onChangePassword={vi.fn()}
              accessToken="test-token"
              assistantApi={assistantApi}
            />
          }
        >
          <Route index element={<div>Overview content</div>} />
          <Route path="/system/identity/users" element={<div>Users content</div>} />
          <Route path="/system/identity/roles" element={<div>Roles content</div>} />
          <Route path="/plugins/tradelab" element={<div>Strategy Lab content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell workspace tabs", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores valid persisted tabs for the current user", () => {
    window.localStorage.setItem(
      "blocks.workspace.tabs.admin",
      JSON.stringify({
        version: 1,
        activeRoute: "/system/identity/users",
        routes: ["/", "/system/identity/users", "/plugins/tradelab", "/missing"],
      }),
    );

    renderShell("/system/identity/users");

    expect(screen.getByRole("tab", { name: "Platform Overview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Users" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: "Strategy Lab" })).toBeTruthy();
  });

  it("opens a deep-linked accessible route as a tab", () => {
    renderShell("/plugins/tradelab");

    expect(screen.getByRole("tab", { name: "Platform Overview" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Strategy Lab" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Strategy Lab content")).toBeTruthy();
  });

  it("opens sidebar routes as tabs without duplicates", async () => {
    const actor = userEvent.setup();

    renderShell("/");

    await actor.click(screen.getByRole("button", { name: "Identity" }));
    await actor.click(screen.getByRole("link", { name: "Users" }));
    await actor.click(screen.getByRole("link", { name: "Users" }));

    expect(screen.getAllByRole("tab", { name: "Users" })).toHaveLength(1);
    expect(screen.getByText("Users content")).toBeTruthy();
  });

  it("closes the active tab and navigates to the nearest left tab", async () => {
    const actor = userEvent.setup();
    window.localStorage.setItem(
      "blocks.workspace.tabs.admin",
      JSON.stringify({
        version: 1,
        activeRoute: "/plugins/tradelab",
        routes: ["/", "/system/identity/users", "/plugins/tradelab"],
      }),
    );

    renderShell("/plugins/tradelab");

    await actor.click(screen.getByRole("button", { name: "Close Strategy Lab tab" }));

    expect(screen.getByRole("tab", { name: "Users" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Users content")).toBeTruthy();
  });

  it("opens assistant drawer and sends current page context to the stream client", async () => {
    const actor = userEvent.setup();
    const assistantApi: AssistantApi = {
      streamChat: vi.fn(async (_request, handlers) => {
        handlers.onStart?.({
          event: "start",
          scope: "tradelab",
          mode: "ollama_chat",
        });
        handlers.onChunk?.({
          event: "chunk",
          content: "I can help explain Strategy Lab and paper readiness.",
        });
        handlers.onComplete?.({
          event: "complete",
          suggestions: [],
        });
      }),
    };

    renderShell("/plugins/tradelab", assistantApi);

    await actor.click(screen.getByRole("button", { name: "Open AI assistant" }));
    await actor.click(await screen.findByRole("button", { name: "Explain this page" }));

    expect(assistantApi.streamChat).toHaveBeenCalledWith(
      {
        scope: "tradelab",
        message: "Explain this page",
        pageContext: {
          route: "/plugins/tradelab",
          title: "Strategy Lab",
          ownerKey: "tradelab",
        },
      },
      expect.any(Object),
    );
    expect(await screen.findByText("I can help explain Strategy Lab and paper readiness.")).toBeTruthy();
  });

  it("restores and persists desktop sidebar mode for the current user", async () => {
    const actor = userEvent.setup();
    window.localStorage.setItem(
      "blocks.sidebar.layoutMode.admin",
      JSON.stringify("collapsed"),
    );

    renderShell("/");

    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeTruthy();

    await actor.click(screen.getByRole("button", { name: "Expand navigation" }));

    expect(window.localStorage.getItem("blocks.sidebar.layoutMode.admin")).toBe(
      JSON.stringify("expanded"),
    );
  });
});
