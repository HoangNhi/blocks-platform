// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CredentialBoundaryPanel } from "./credential-boundary-panel"
import { DEFAULT_CREDENTIAL_BOUNDARY_CHECKS } from "../credential-boundary"

describe("CredentialBoundaryPanel", () => {
  it("renders manual credential checklist without key or secret inputs", () => {
    render(
      <CredentialBoundaryPanel
        checks={DEFAULT_CREDENTIAL_BOUNDARY_CHECKS}
        onChecksChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Credential boundary")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Read-only enabled" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Trading disabled" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Withdraw disabled" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Futures/Margin disabled" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "IP restricted" })).toBeTruthy()
    expect(screen.queryByLabelText(/api key|key api|secret|key bí mật|api secret/i)).toBeNull()
  })

  it("emits changed checks when user toggles a checklist item", async () => {
    const user = userEvent.setup()
    const onChecksChange = vi.fn()
    render(
      <CredentialBoundaryPanel
        checks={DEFAULT_CREDENTIAL_BOUNDARY_CHECKS}
        onChecksChange={onChecksChange}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Read-only enabled" }))

    expect(onChecksChange).toHaveBeenCalledWith({
      ...DEFAULT_CREDENTIAL_BOUNDARY_CHECKS,
      readOnlyEnabled: true,
    })
  })
})
