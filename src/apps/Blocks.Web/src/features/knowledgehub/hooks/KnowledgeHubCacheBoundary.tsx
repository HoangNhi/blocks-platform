import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { collectionKeys } from "./collection-query-keys";

export type KnowledgeHubSession = Readonly<{ actorId: string | null }>;

const SessionContext =
  createContext<RefObject<KnowledgeHubSession> | null>(null);

export function useKnowledgeHubSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("KnowledgeHubCacheBoundary is required");
  }
  return session;
}

export function KnowledgeHubCacheBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isAuthenticated, loading } = useAuth();
  const queryClient = useQueryClient();
  const actorId = !loading && isAuthenticated ? (user?.Id ?? null) : null;

  // A new immutable token is created for every observed actor transition.
  const snapshot = useMemo<KnowledgeHubSession>(
    () => ({ actorId }),
    [actorId]
  );
  const current = useRef(snapshot);

  useLayoutEffect(() => {
    const previousActorId = current.current.actorId;
    current.current = snapshot;

    if (!previousActorId || previousActorId === actorId) return;
    const key = collectionKeys.actor(previousActorId);
    // Cancel transport and synchronously evict ONLY the old private cache.
    void queryClient.cancelQueries({ queryKey: key }).catch(() => undefined);
    queryClient.removeQueries({ queryKey: key });
  }, [actorId, snapshot, queryClient]);

  return (
    <SessionContext.Provider value={current}>
      {children}
    </SessionContext.Provider>
  );
}
