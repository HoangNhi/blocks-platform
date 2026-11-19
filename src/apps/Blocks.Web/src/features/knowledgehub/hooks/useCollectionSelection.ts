import { useCallback, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type Selection =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "selected"; id: string };

export function parseSelection(params: URLSearchParams): Selection {
  const values = params.getAll("c");
  if (values.length === 0) return { state: "none" };
  if (
    values.length !== 1 ||
    !UUID.test(values[0]) ||
    values[0].toLowerCase() === ZERO_UUID
  ) {
    return { state: "invalid" };
  }
  return { state: "selected", id: values[0].toLowerCase() };
}

export function useCollectionSelection() {
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(location);
  useLayoutEffect(() => {
    latest.current = location;
  }, [location]);

  const getCurrent = useCallback(
    () => parseSelection(new URLSearchParams(latest.current.search)),
    []
  );

  const select = useCallback(
    (id: string) => {
      if (!UUID.test(id) || id.toLowerCase() === ZERO_UUID) return;
      const now = latest.current;
      if (now.pathname !== "/knowledgehub") return;
      const next = new URLSearchParams(now.search);
      next.set("c", id.toLowerCase());
      navigate(
        {
          pathname: now.pathname,
          search: "?" + next.toString(),
          hash: now.hash,
        },
        { replace: false } // explicit selection PUSHES history
      );
    },
    [navigate]
  );

  const clearIfSelected = useCallback(
    (deletedId: string) => {
      const now = latest.current;
      if (now.pathname !== "/knowledgehub") return;
      const next = new URLSearchParams(now.search);
      const selection = parseSelection(next);
      if (
        selection.state !== "selected" ||
        selection.id !== deletedId.toLowerCase()
      )
        return;
      next.delete("c"); // preserve unrelated keys
      navigate(
        {
          pathname: now.pathname,
          search: next.toString() ? "?" + next.toString() : "",
          hash: now.hash,
        },
        { replace: true } // selected delete REPLACES history
      );
    },
    [navigate]
  );

  return {
    selection: parseSelection(new URLSearchParams(location.search)),
    getCurrent,
    select,
    clearIfSelected,
  };
}
