export const collectionKeys = {
  all: ["knowledgehub"] as const,
  actor: (actorId: string) => ["knowledgehub", actorId] as const,
  lists: (actorId: string) =>
    [...collectionKeys.actor(actorId), "collections"] as const,
  detail: (actorId: string, id: string) =>
    [...collectionKeys.actor(actorId), "detail", id] as const,
};
