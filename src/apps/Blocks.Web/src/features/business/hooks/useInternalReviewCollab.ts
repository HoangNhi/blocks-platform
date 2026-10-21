import { useCallback, useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export interface CollaboratorState {
  clientId?: number;
  name: string;
  initials: string;
  color: string;
}

export interface UseInternalReviewCollabOptions {
  cycleId?: string;
  reviewRound?: number | null;
  enabled?: boolean;
  onCommentSignal: () => void;
  currentUserFullname?: string | null;
  sarYDocSnapshot?: string | null;
}

function getInitials(fullname?: string | null): string {
  const trimmed = fullname?.trim();
  if (!trimmed) {
    return "?";
  }

  const initials = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return initials || trimmed.slice(0, 2).toUpperCase();
}

function getLocalColor(fullname?: string | null): string {
  const seed = fullname?.trim() || "anonymous";
  let hash = 0;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 72% 48%)`;
}

function normalizeCollaboratorState(
  clientId: number,
  state: unknown,
): CollaboratorState | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const user = (state as { user?: Partial<CollaboratorState> }).user;
  const name = user?.name?.trim();
  const initials = user?.initials?.trim();
  const color = user?.color?.trim();

  if (!name || !initials || !color) {
    return null;
  }

  return { clientId, name, initials, color };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function useInternalReviewCollab({
  cycleId,
  reviewRound,
  enabled = true,
  onCommentSignal,
  currentUserFullname,
  sarYDocSnapshot,
}: UseInternalReviewCollabOptions) {
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const signalMapRef = useRef<Y.Map<unknown> | null>(null);
  const sarProviderRef = useRef<WebsocketProvider | null>(null);
  const sarDocRef = useRef<Y.Doc | null>(null);
  const [sarYdoc, setSarYdoc] = useState<Y.Doc | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorState[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const broadcastCommentChange = useCallback(() => {
    signalMapRef.current?.set("v", {
      at: Date.now(),
      reviewRound: reviewRound ?? null,
    });
  }, [reviewRound]);

  useEffect(() => {
    if (!enabled || !cycleId) {
      return;
    }

    const wsUrl = import.meta.env.VITE_SAR_WS_URL || "ws://localhost:1234";

    const signalRoomName = `internal_review_${cycleId}`;
    const signalDoc = new Y.Doc();
    const signalProvider = new WebsocketProvider(wsUrl, signalRoomName, signalDoc);
    const commentSignalMap = signalDoc.getMap("commentSignal");
    const awareness = signalProvider.awareness;

    docRef.current = signalDoc;
    providerRef.current = signalProvider;
    signalMapRef.current = commentSignalMap;

    const syncCollaborators = () => {
      const nextCollaborators = Array.from(awareness.getStates().entries())
        .filter(([clientId]) => clientId !== awareness.clientID)
        .map(([clientId, state]) => normalizeCollaboratorState(clientId, state))
        .filter((state): state is CollaboratorState => !!state);

      setCollaborators(nextCollaborators);
    };

    const handleStatus = (event: {
      status: "connected" | "connecting" | "disconnected";
    }) => {
      setIsConnected(event.status === "connected");
    };

    const handleCommentSignal = (
      _event: Y.YMapEvent<unknown>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local) {
        return;
      }

      const signalValue = commentSignalMap.get("v");
      if (typeof signalValue === "object" && signalValue !== null) {
        const signalRound = (signalValue as { reviewRound?: number | null }).reviewRound;
        if (
          typeof signalRound === "number" &&
          typeof reviewRound === "number" &&
          signalRound !== reviewRound
        ) {
          return;
        }
      }

      onCommentSignal();
    };

    signalProvider.on("status", handleStatus);
    awareness.on("change", syncCollaborators);
    commentSignalMap.observe(handleCommentSignal);

    awareness.setLocalStateField("user", {
      name: currentUserFullname?.trim() || "Anonymous",
      initials: getInitials(currentUserFullname),
      color: getLocalColor(currentUserFullname),
    });

    syncCollaborators();

    const sarRoomName = `sar_cycle_${cycleId}`;
    const sarDoc = new Y.Doc();

    if (sarYDocSnapshot) {
      try {
        Y.applyUpdate(sarDoc, base64ToUint8Array(sarYDocSnapshot));
      } catch {
        // Fall back to the live websocket content if the snapshot is invalid.
      }
    }

    const sarProvider = new WebsocketProvider(wsUrl, sarRoomName, sarDoc);
    sarDocRef.current = sarDoc;
    sarProviderRef.current = sarProvider;
    setSarYdoc(sarDoc);

    return () => {
      commentSignalMap.unobserve(handleCommentSignal);
      awareness.off("change", syncCollaborators);
      signalProvider.off("status", handleStatus);

      signalMapRef.current = null;
      providerRef.current = null;
      docRef.current = null;
      setCollaborators([]);
      setIsConnected(false);

      signalProvider.destroy();
      signalDoc.destroy();

      sarProvider.destroy();
      sarDoc.destroy();
      sarProviderRef.current = null;
      sarDocRef.current = null;
      setSarYdoc(null);
    };
  }, [cycleId, currentUserFullname, enabled, onCommentSignal, reviewRound, sarYDocSnapshot]);

  return {
    collaborators,
    isConnected,
    broadcastCommentChange,
    sarYdoc,
  };
}
