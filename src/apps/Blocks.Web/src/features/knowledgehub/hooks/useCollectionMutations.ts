import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CollectionInput } from "../types/collections.types";
import {
  useKnowledgeHubSession,
  type KnowledgeHubSession,
} from "./KnowledgeHubCacheBoundary";
import { useEffect, useRef } from "react";
import { collectionsApi } from "../api/collections.api";
import { collectionKeys } from "./collection-query-keys";
import { toast } from "sonner";

type Navigation = {
  select: (id: string) => void;
  clearIfSelected: (id: string) => void;
  getCurrent: () => string | null;
};

type BaseArgs = { guard: KnowledgeHubSession };
type CreateArgs = BaseArgs & {
  input: CollectionInput;
  selectionBefore: string;
};
type EditArgs = BaseArgs & { id: string; input: CollectionInput };
type DeleteArgs = BaseArgs & { id: string };

export function useCollectionMutations(
  actorId: string | null,
  navigation: Navigation,
) {
  const client = useQueryClient();
  const currentSession = useKnowledgeHubSession();
  const mounted = useRef(true);
  const createInFlight = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isCurrent = (guard: KnowledgeHubSession) =>
    mounted.current && guard === currentSession.current;

  const capture = () => {
    const guard = currentSession.current;
    if (!actorId || guard.actorId !== actorId) {
      throw new Error("Tài khoản đã thay đổi; vui lòng thử lại.");
    }
    return guard;
  };

  const create = useMutation({
    mutationFn: (v: CreateArgs) => collectionsApi.create(v.input),
    retry: false,
    onSuccess: (created, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });
      // A deliberate user selection after submit takes priority.
      if (JSON.stringify(navigation.getCurrent()) === v.selectionBefore) {
        navigation.select(created.Id);
      }
      toast.success("Đã tạo bộ sưu tập");
    },
  });

  const rename = useMutation({
    mutationFn: (v: EditArgs) => collectionsApi.update(v.id, v.input),
    retry: false,
    onSuccess: (updated, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      client.setQueryData(
        collectionKeys.detail(v.guard.actorId, v.id),
        updated,
      );
      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });
      toast.success("Đã cập nhật bộ sưu tập");
    },
  });

  const remove = useMutation({
    mutationFn: (v: DeleteArgs) => collectionsApi.remove(v.id),
    retry: false,
    onSuccess: (_, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      client.removeQueries({
        queryKey: collectionKeys.detail(v.guard.actorId, v.id),
        exact: true,
      });

      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });

      navigation.clearIfSelected(v.id);
      toast.success("Đã xóa bộ sưu tập");
    },
  });

  const createCollection = async (input: CollectionInput) => {
    if (createInFlight.current) {
      return createInFlight.current;
    }

    const guard = capture();
    const request = create
      .mutateAsync({
        guard,
        input,
        selectionBefore: JSON.stringify(navigation.getCurrent()),
      })
      .then((created) => (isCurrent(guard) ? created : null));
    createInFlight.current = request;

    try {
      return await request;
    } finally {
      if (createInFlight.current === request) {
        createInFlight.current = null;
      }
    }
  };

  const renameCollection = async (id: string, input: CollectionInput) => {
    const guard = capture();
    const updated = await rename.mutateAsync({ guard, id, input });
    return isCurrent(guard) ? updated : null;
  };

  const deleteCollection = async (id: string) => {
    const guard = capture();
    const deleted = await remove.mutateAsync({ guard, id });
    return isCurrent(guard) ? deleted : null;
  };

  return {
    create,
    rename,
    remove,
    createCollection,
    renameCollection,
    deleteCollection,
  };
}
