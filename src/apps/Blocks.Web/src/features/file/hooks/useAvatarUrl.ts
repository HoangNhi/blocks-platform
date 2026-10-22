import { useState, useEffect, useContext, useRef } from "react";
import { AuthContext } from "@/contexts/auth-context-definition";
import { fileService } from "@/features/file/api/uploadfile.api";
import { API_BASE_URL } from "@/lib/api";

type AvatarSourceClassification =
  | { kind: "avatar"; key: string }
  | { kind: "malformed" }
  | { kind: "external"; url: string }
  | { kind: "static"; url: string }
  | { kind: "none" };

function getApiOriginAndBasePath(customApiBaseUrl?: string) {
  const baseUrl = customApiBaseUrl || API_BASE_URL;
  let expectedOrigin = "";
  let apiBasePath = "";
  try {
    const parsed = new URL(baseUrl, window.location.origin);
    expectedOrigin = parsed.origin.toLowerCase();
    apiBasePath = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    expectedOrigin = window.location.origin.toLowerCase();
    apiBasePath = "";
  }
  return { expectedOrigin, apiBasePath };
}

const AVATAR_ROUTE_PREFIX_REGEX = /^(?:File\/(?:api\/Avatar|System\/Avatar)|System\/Avatar)\//i;
const UUID_FILE_REGEX = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(?:png|jpg|jpeg|webp))$/i;

export function classifyAvatarSource(
  source?: string | null,
  customApiBaseUrl?: string
): AvatarSourceClassification {
  if (!source) {
    return { kind: "none" };
  }

  // Safe pass-through schemes (never credential-fetch)
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return { kind: "static", url: source };
  }

  const { expectedOrigin, apiBasePath } = getApiOriginAndBasePath(customApiBaseUrl);

  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      // Scheme + host boundary check: protocol and host must match API origin
      if (url.origin.toLowerCase() !== expectedOrigin) {
        return { kind: "external", url: source };
      }

      let pathname = decodeURIComponent(url.pathname);
      if (apiBasePath && pathname.toLowerCase().startsWith(apiBasePath)) {
        pathname = pathname.slice(apiBasePath.length);
      }
      const cleanPath = pathname.replace(/^\/+/, "");

      if (AVATAR_ROUTE_PREFIX_REGEX.test(cleanPath)) {
        const lastSlash = cleanPath.lastIndexOf("/");
        const fileName = cleanPath.slice(lastSlash + 1);
        if (UUID_FILE_REGEX.test(fileName)) {
          return { kind: "avatar", key: `System/Avatar/${fileName}` };
        }
        return { kind: "malformed" };
      }

      // Same-origin URL targeting non-avatar route is static
      return { kind: "static", url: source };
    } catch {
      return { kind: "none" };
    }
  }

  // Handle path-based sources
  let clean = source.replace(/\\/g, "/");
  if (clean.startsWith("/")) {
    if (apiBasePath && clean.toLowerCase().startsWith(apiBasePath + "/")) {
      clean = clean.slice(apiBasePath.length);
    }
    clean = clean.replace(/^\/+/, "");

    if (AVATAR_ROUTE_PREFIX_REGEX.test(clean)) {
      const lastSlash = clean.lastIndexOf("/");
      const fileName = clean.slice(lastSlash + 1);
      if (UUID_FILE_REGEX.test(fileName)) {
        return { kind: "avatar", key: `System/Avatar/${fileName}` };
      }
      return { kind: "malformed" };
    }

    // Root-relative path that is not an avatar endpoint (e.g. /assets/avatar.png)
    return { kind: "static", url: source };
  }

  // Raw key or relative path
  clean = clean.replace(/^\/+/, "");
  if (AVATAR_ROUTE_PREFIX_REGEX.test(clean)) {
    const lastSlash = clean.lastIndexOf("/");
    const fileName = clean.slice(lastSlash + 1);
    if (UUID_FILE_REGEX.test(fileName)) {
      return { kind: "avatar", key: `System/Avatar/${fileName}` };
    }
    return { kind: "malformed" };
  }

  return { kind: "none" };
}

export function extractAvatarKey(source: string, customApiBaseUrl?: string): string | null {
  const result = classifyAvatarSource(source, customApiBaseUrl);
  if (result.kind === "avatar") {
    return result.key;
  }
  return null;
}

interface StoredAvatar {
  source: string;
  userId: string;
  url: string;
}

export function useAvatarUrl(source?: string | null): string | undefined {
  const authContext = useContext(AuthContext);
  const userId = authContext?.user?.Id;
  const isAuthenticated = authContext?.isAuthenticated ?? false;

  const [stored, setStored] = useState<StoredAvatar | null>(null);
  const activeBlobUrlRef = useRef<string | undefined>(undefined);

  const currentClassification = classifyAvatarSource(source);

  // Synchronous render derivation:
  // Non-avatar static/external sources pass through directly without delay
  let activeUrl: string | undefined = undefined;
  if (currentClassification.kind === "static" || currentClassification.kind === "external") {
    activeUrl = currentClassification.url;
  } else if (currentClassification.kind === "avatar") {
    if (
      isAuthenticated &&
      userId &&
      stored &&
      stored.source === source &&
      stored.userId === userId
    ) {
      activeUrl = stored.url;
    } else {
      activeUrl = undefined;
    }
  } else {
    // kind === "malformed" or "none"
    activeUrl = undefined;
  }

  useEffect(() => {
    const effectClassification = classifyAvatarSource(source);
    if (effectClassification.kind !== "avatar" || !isAuthenticated || !userId || !source) {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = undefined;
      }
      return;
    }

    const key = effectClassification.key;
    const abortController = new AbortController();
    let isMounted = true;

    const fetchBlob = async () => {
      try {
        const blob = await fileService.getAvatarBlob(key, abortController.signal);
        if (!isMounted || abortController.signal.aborted) {
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
        activeBlobUrlRef.current = objectUrl;
        setStored({ source, userId, url: objectUrl });
      } catch {
        if (isMounted && !abortController.signal.aborted) {
          setStored(null);
        }
      }
    };

    fetchBlob();

    return () => {
      isMounted = false;
      abortController.abort();
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = undefined;
      }
    };
  }, [source, userId, isAuthenticated]);

  return activeUrl;
}