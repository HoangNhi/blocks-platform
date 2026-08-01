import { createApiClient } from "@/lib/api/client"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { adaptSystemNavigation } from "./system-menu-adapter"
import type { NavNode } from "./types"
import type { SystemGroupRecord, SystemMenuRecord } from "./system-menu-types"
import { navigationFixture } from "./fixtures"

let apiClient: ReturnType<typeof createApiClient> | null = null

function getApiClient() {
  if (!apiClient) {
    const tokenStore = createBrowserTokenStore()
    apiClient = createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
      getAccessToken: tokenStore.getAccessToken,
    })
  }

  return apiClient
}

export async function loadNavigationForUser(userId: string) {
  const client = getApiClient()
  const [groups, menus] = await Promise.all([
    client.request<SystemGroupRecord[]>("/api/system/SystemGroup/get-all"),
    client.request<SystemMenuRecord[]>("/api/system/Menu/get-list-by-user", {
      query: { id: userId },
    }),
  ])

  return adaptSystemNavigation({ groups, menus })
}

export function getDevelopmentNavigationFallback(): NavNode[] {
  return navigationFixture
}
