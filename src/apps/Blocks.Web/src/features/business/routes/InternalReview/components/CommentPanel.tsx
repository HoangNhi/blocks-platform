import { useEffect, useMemo, useRef } from "react";
import type { InternalComment } from "@/features/business/types/internalreview.types";
import CommentItem from "./CommentItem";

interface CommentPanelProps {
  comments: InternalComment[];
  activeCommentId?: string | null;
  currentUsername?: string | null;
  deletingCommentId?: string | null;
  onDeleteComment?: (comment: InternalComment) => void;
  onCommentClick?: (comment: InternalComment) => void;
}

export default function CommentPanel({
  comments,
  activeCommentId,
  currentUsername,
  deletingCommentId,
  onDeleteComment,
  onCommentClick,
}: CommentPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const normalizedUsername = useMemo(
    () => (currentUsername ?? "").trim().toLowerCase(),
    [currentUsername],
  );

  useEffect(() => {
    if (!activeCommentId || !scrollContainerRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    const escapedCommentId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(activeCommentId)
        : null;
    const target = escapedCommentId
      ? container.querySelector<HTMLElement>(`[data-comment-id="${escapedCommentId}"]`)
      : Array.from(container.querySelectorAll<HTMLElement>("[data-comment-id]")).find(
          (candidate) => candidate.getAttribute("data-comment-id") === activeCommentId,
        );

    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeCommentId]);

  return (
    <aside className="h-full min-h-0 border-l bg-slate-50">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b bg-white px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Nhận xét nội bộ</h3>
          <p className="text-xs text-slate-500">{comments.length} nhận xét</p>
        </div>

        <div ref={scrollContainerRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {comments.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
              Chưa có nhận xét nào.
            </div>
          ) : (
            comments.map((comment) => {
              const isOwner =
                normalizedUsername.length > 0 &&
                comment.CreatedBy.trim().toLowerCase() === normalizedUsername;
              const commentRefId = comment.CommentMarkId ?? comment.Id;

              return (
                <CommentItem
                  key={comment.Id}
                  comment={comment}
                  active={activeCommentId === commentRefId}
                  canDelete={isOwner}
                  deleting={deletingCommentId === comment.Id}
                  onDelete={onDeleteComment}
                  onClick={() => onCommentClick?.(comment)}
                />
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
