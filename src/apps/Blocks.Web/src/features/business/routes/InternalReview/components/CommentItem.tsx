import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getFileUrl } from "@/lib/utils";
import type { InternalComment } from "@/features/business/types/internalreview.types";

interface CommentItemProps {
  comment: InternalComment;
  active?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (comment: InternalComment) => void;
  onClick?: () => void;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
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

export function stringToHslColor(str: string): string {
  const seed = str.trim() || "anonymous";
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 72% 48%)`;
}

export default function CommentItem({
  comment,
  active = false,
  canDelete = false,
  deleting = false,
  onDelete,
  onClick,
}: CommentItemProps) {
  const createdAtLabel = comment.CreatedAt
    ? format(new Date(comment.CreatedAt), "dd/MM/yyyy HH:mm")
    : "--";
  const displayName = comment.CreatedByName?.trim() || comment.CreatedBy?.trim() || "Người dùng";
  const commentText = comment.CommentText?.trim() || "(Không có nội dung)";
  const highlightedText = comment.HighlightedText?.trim();

  return (
    <article
      className={cn(
        "rounded-lg border bg-white shadow-sm px-3 py-3 transition-colors border-slate-200",
        active && "border-l-4 border-amber-400 bg-amber-50",
        onClick && "cursor-pointer",
      )}
      data-comment-id={comment.CommentMarkId ?? comment.Id}
      onClick={onClick}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            className="h-8 w-8 shrink-0 rounded-full"
          >
            <AvatarImage src={getFileUrl(comment.CreatedByAvatar)} alt={displayName} />
            <AvatarFallback
              className="rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: stringToHslColor(displayName) }}
            >
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>

          <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{displayName}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-400">{createdAtLabel}</span>
          {canDelete && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-500 hover:text-red-600"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(comment);
              }}
              disabled={deleting}
              title="Xóa nhận xét"
              aria-label="Xóa nhận xét"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>

      {highlightedText ? (
        <blockquote className="mt-2 rounded-r-sm border-l-2 border-slate-300 bg-slate-50 py-1 pl-2 text-xs italic text-slate-600">
          {highlightedText}
        </blockquote>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{commentText}</p>
    </article>
  );
}
