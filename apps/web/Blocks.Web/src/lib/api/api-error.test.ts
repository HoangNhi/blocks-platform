import { describe, expect, it } from "vitest"

import {
  ApiError,
  getEnvelopeMessage,
  getEnvelopeStatusCode,
  toApiError,
} from "./api-error"

describe("API error helpers", () => {
  it("reads camelCase and PascalCase status codes", () => {
    expect(getEnvelopeStatusCode({ statusCode: 401 })).toBe(401)
    expect(getEnvelopeStatusCode({ StatusCode: 403 })).toBe(403)
  })

  it("reads camelCase and PascalCase messages", () => {
    expect(getEnvelopeMessage({ message: "Invalid login" })).toBe("Invalid login")
    expect(getEnvelopeMessage({ Message: "Access denied" })).toBe("Access denied")
  })

  it("reads ASP.NET ProblemDetails validation errors", () => {
    expect(
      getEnvelopeMessage({
        title: "One or more validation errors occurred.",
        errors: {
          Username: ["Username is already taken."],
          Email: ["Email is invalid."],
        },
      }),
    ).toBe("Username: Username is already taken.; Email: Email is invalid.")
  })

  it("reads detail and nested string data when no message exists", () => {
    expect(getEnvelopeMessage({ detail: "User could not be saved." })).toBe(
      "User could not be saved.",
    )
    expect(getEnvelopeMessage({ data: "The username already exists." })).toBe(
      "The username already exists.",
    )
  })

  it("normalizes API errors", () => {
    const error = new ApiError("Access denied", 403)

    expect(error.message).toBe("Access denied")
    expect(error.statusCode).toBe(403)
    expect(error.isUnauthorized).toBe(false)
    expect(error.isForbidden).toBe(true)
  })

  it("preserves envelope data on normalized API errors", () => {
    const error = toApiError(
      {
        Success: false,
        StatusCode: 400,
        Message: "Execution mode 'paper' is not enabled yet.",
        Data: {
          mode: "paper",
          reasonCode: "execution_mode_not_enabled",
          allowedModes: ["backtest"],
          blockedModes: ["paper", "live"],
        },
      },
      "Request failed",
    )

    expect(error.message).toBe("Execution mode 'paper' is not enabled yet.")
    expect(error.statusCode).toBe(400)
    expect(error.data).toEqual({
      mode: "paper",
      reasonCode: "execution_mode_not_enabled",
      allowedModes: ["backtest"],
      blockedModes: ["paper", "live"],
    })
  })

  it("uses the HTTP status when the error body has no status code", () => {
    const error = toApiError(
      { detail: "User could not be saved." },
      "Request failed",
      422,
    )

    expect(error.statusCode).toBe(422)
  })
})
