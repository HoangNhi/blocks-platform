import { useEffect, useState } from "react"

import { ApiError } from "@/lib/api/api-error"

import { loadNavigationForUser } from "./navigation-api"
import type { NavNode } from "./types"
import { getDevelopmentNavigationFallback } from "./navigation-api"

type NavigationLoadState = {
  navigation: NavNode[]
  isLoading: boolean
  error: Error | null
}

type NavigationLoadFailure =
  | {
      kind: "fallback"
      navigation: NavNode[]
    }
  | {
      kind: "error"
      error: Error
    }

function isDevelopmentNavigationFallbackEnabled() {
  return (
    import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_DEV_NAVIGATION_FALLBACK === "true"
  )
}

function isTransportFailure(error: unknown) {
  return error instanceof TypeError
}

function normalizeNavigationError(loadError: unknown) {
  return loadError instanceof Error
    ? loadError
    : new Error("Unable to load navigation.")
}

export function resolveNavigationLoadFailure(
  loadError: unknown,
): NavigationLoadFailure {
  const error = normalizeNavigationError(loadError)

  if (error instanceof ApiError) {
    return {
      kind: "error",
      error,
    }
  }

  if (
    isDevelopmentNavigationFallbackEnabled() &&
    isTransportFailure(error)
  ) {
    return {
      kind: "fallback",
      navigation: getDevelopmentNavigationFallback(),
    }
  }

  return {
    kind: "error",
    error,
  }
}

export function useNavigationData(userId: string | null) {
  const [state, setState] = useState<NavigationLoadState>({
    navigation: [],
    isLoading: Boolean(userId),
    error: null,
  })

  useEffect(() => {
    let active = true

    if (!userId) {
      return () => {
        active = false
      }
    }

    queueMicrotask(() => {
      if (!active) return

      setState((current) => ({
        ...current,
        isLoading: true,
        error: null,
      }))

      void loadNavigationForUser(userId)
        .then((navigation) => {
          if (!active) return
          setState({
            navigation,
            isLoading: false,
            error: null,
          })
        })
        .catch((loadError: unknown) => {
          if (!active) return

          const failure = resolveNavigationLoadFailure(loadError)

          if (failure.kind === "fallback") {
            setState({
              navigation: failure.navigation,
              isLoading: false,
              error: null,
            })
            return
          }

          setState({
            navigation: [],
            isLoading: false,
            error: failure.error,
          })
        })
    })

    return () => {
      active = false
    }
  }, [userId])

  if (!userId) {
    return {
      navigation: [],
      isLoading: false,
      error: null,
    }
  }

  return state
}
