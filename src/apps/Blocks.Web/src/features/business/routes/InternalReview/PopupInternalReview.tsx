import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import { ChevronLeft, ChevronRight, FileDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { internalReviewService } from "@/features/business/api/internalreview.api";
import { evidenceCycleMapService } from "@/features/business/api/evidenceCycleMap.api";
import { useInternalReviewComments } from "@/features/business/hooks/useInternalReviewComments";
import {
  useInternalReviewCollab,
  type CollaboratorState,
} from "@/features/business/hooks/useInternalReviewCollab";
import Collaboration from "@tiptap/extension-collaboration";
import type {
  InternalComment,
  InternalReviewListItem,
} from "@/features/business/types/internalreview.types";
import { sarService } from "@/features/business/api/sar.api";
import type { EvidenceCycleMap } from "@/features/business/types/evidence-cycle-map.types";
import {
  createSarEvidenceListRequest,
  createSarEvidencePreviewCycleMap,
  createSarEvidencePreviewQueryKey,
  resolveSarEvidencePreviewCycleMapId,
} from "@/features/business/routes/Sar/PopupSarEditor";
import {
  applyCommentMarkVisualState,
  findMarkRange,
  findTextRange,
} from "./commentEditorUtils";
import { EvidenceTag } from "../Sar/extensions/EvidenceTag";
import DecisionToolbar from "./components/DecisionToolbar";
import CommentPanel from "./components/CommentPanel";

interface PopupInternalReviewProps {
  open: boolean;
  item: InternalReviewListItem | null;
  onOpenChange: (open: boolean) => void;
  onDataChanged: () => void;
}

interface TocItem {
  text: string;
  level: number;
  pos: number;
}

interface ComposerDraft {
  markId: string;
  highlightedText: string;
  from: number;
  to: number;
}

interface BuildComposerDraftInput {
  from: number;
  to: number;
  highlightedText: string;
  markId: string;
}

interface BubbleSelectionRange {
  from: number;
  to: number;
}

interface CommentActivationGuardParams {
  selectionFrom: number;
  selectionTo: number;
  isComposerOpen: boolean;
  hasDraft: boolean;
}

const COMMENT_ROLES = new Set([1, 2, 3, 4, 5]);
const PopupEvidenceCycleMap = lazy(
  () => import("@/features/business/routes/EvidenceCycleMap/PopupEvidenceCycleMap"),
);

interface EvidenceTagClickNode {
  type: { name: string };
  attrs?: { evidenceId?: unknown };
}

export function resolveEvidenceTagClickTargetId(
  node: EvidenceTagClickNode,
): string | null {
  if (node.type.name !== "evidenceTag") {
    return null;
  }

  const evidenceId = String(node.attrs?.evidenceId ?? "").trim();
  return evidenceId || null;
}

export function shouldShowCommentComposerBubble(
  selection: BubbleSelectionRange,
  isComposerOpen: boolean,
): boolean {
  return isComposerOpen || selection.from !== selection.to;
}

export function shouldHandleCommentActivated({
  selectionFrom,
  selectionTo,
  isComposerOpen,
  hasDraft,
}: CommentActivationGuardParams): boolean {
  if (isComposerOpen || hasDraft) {
    return false;
  }

  return selectionFrom === selectionTo;
}

export function buildComposerDraftFromSelection(
  input: BuildComposerDraftInput,
): ComposerDraft | null {
  const highlightedText = input.highlightedText.trim();
  if (input.from === input.to || !highlightedText) {
    return null;
  }

  return {
    markId: input.markId,
    highlightedText,
    from: input.from,
    to: input.to,
  };
}

interface PopupInternalReviewComposerSnippetPreviewProps {
  highlightedText: string;
}

export function PopupInternalReviewComposerSnippetPreview({
  highlightedText,
}: PopupInternalReviewComposerSnippetPreviewProps) {
  return (
    <blockquote className="max-h-[3.5rem] overflow-hidden border-l-2 border-amber-400 bg-amber-50 px-3 py-2">
      <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm italic leading-5 text-amber-950">
        {highlightedText}
      </p>
    </blockquote>
  );
}

export function canDecideInternalReview(item: InternalReviewListItem | null): boolean {
  return !!item && item.Status === 2 && item.CanApproveByRole === true;
}

export function normalizeEvaluationPurpose(
  evaluationPurpose: string | null | undefined,
): string | null {
  const normalized = evaluationPurpose?.trim();
  return normalized ? normalized : null;
}

export function shouldSyncInternalReviewCommentMarks(
  status: InternalReviewListItem["Status"] | null | undefined,
  open: boolean,
  isCommentsLoading: boolean,
): boolean {
  return open && !isCommentsLoading && status === 2;
}

interface PopupInternalReviewCollaboratorsProps {
  collaborators: CollaboratorState[];
}

export function PopupInternalReviewCollaborators({
  collaborators,
}: PopupInternalReviewCollaboratorsProps) {
  const visibleCollaborators = collaborators.slice(0, 4);
  const collaboratorOverflowCount = Math.max(
    collaborators.length - visibleCollaborators.length,
    0,
  );

  if (visibleCollaborators.length === 0) {
    return null;
  }

  return (
    <div className="flex -space-x-2">
      {visibleCollaborators.map((collaborator) => (
        <div
          key={collaborator.clientId}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: collaborator.color }}
          title={collaborator.name}
          aria-label={collaborator.name}
        >
          {collaborator.initials}
        </div>
      ))}
      {collaboratorOverflowCount > 0 ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-semibold text-slate-600 shadow-sm">
          +{collaboratorOverflowCount}
        </div>
      ) : null}
    </div>
  );
}

interface PopupInternalReviewHeaderTitleProps {
  title: string;
}

export function PopupInternalReviewHeaderTitle({ title }: PopupInternalReviewHeaderTitleProps) {
  return <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>;
}

interface PopupInternalReviewHeaderMetaProps {
  statusLabel: string;
  statusBadgeClass: string;
  reviewRound?: number | null;
  evaluationPurpose?: string | null;
}

export function PopupInternalReviewHeaderMeta({
  statusLabel,
  statusBadgeClass,
  reviewRound,
  evaluationPurpose,
}: PopupInternalReviewHeaderMetaProps) {
  const normalizedPurpose = normalizeEvaluationPurpose(evaluationPurpose);

  return (
    <div className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden text-sm">
      <span className={`shrink-0 rounded-full px-3 py-1 font-medium ${statusBadgeClass}`}>
        {statusLabel}
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
        Vòng {reviewRound ?? 1}
      </span>
      {normalizedPurpose ? (
        <>
          <span className="shrink-0 text-slate-300" aria-hidden="true">
            ·
          </span>
          <span className="min-w-0 max-w-[320px] truncate text-slate-500">
            {normalizedPurpose}
          </span>
        </>
      ) : null}
    </div>
  );
}

export default function PopupInternalReview({
  open,
  item,
  onOpenChange,
  onDataChanged,
}: PopupInternalReviewProps) {
  const { user } = useAuth();
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [composerDraft, setComposerDraft] = useState<ComposerDraft | null>(null);
  const showComposerRef = useRef(false);
  const composerDraftRef = useRef<ComposerDraft | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const previousItemKeyRef = useRef<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [evidencePreviewId, setEvidencePreviewId] = useState<string | null>(null);
  const [isEvidencePreviewOpen, setIsEvidencePreviewOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const isCommentRealtimeEnabled = open && !!item && item.Status === 2;

  const {
    comments,
    isLoading: isCommentsLoading,
    addComment,
    isAdding,
    deleteComment,
    refetch,
  } = useInternalReviewComments({
    cycleId: item?.CycleId,
    reviewRound: item?.ReviewRound,
    enabled: isCommentRealtimeEnabled,
  });

  useEffect(() => {
    showComposerRef.current = showComposer;
  }, [showComposer]);

  useEffect(() => {
    composerDraftRef.current = composerDraft;
  }, [composerDraft]);

  const handleCommentSignal = useCallback(() => {
    if (!isCommentRealtimeEnabled) {
      return;
    }

    void refetch();
  }, [isCommentRealtimeEnabled, refetch]);

  const { collaborators, isConnected, broadcastCommentChange, sarYdoc } = useInternalReviewCollab({
    cycleId: item?.CycleId,
    reviewRound: item?.ReviewRound,
    enabled: open && !!item,
    onCommentSignal: handleCommentSignal,
    currentUserFullname: user?.Fullname,
    sarYDocSnapshot: item?.YDocSnapshotBase64,
  });

  const visibleComments = useMemo(
    () => (item?.Status === 2 ? comments : []),
    [comments, item?.Status],
  );

  const evidenceListRequest = useMemo(
    () => (item?.CycleId ? createSarEvidenceListRequest(item.CycleId) : null),
    [item?.CycleId],
  );

  const { data: evidenceListResponse } = useQuery({
    queryKey: ["internal-review-verified-evidences", item?.CycleId],
    queryFn: () => evidenceCycleMapService.getList(evidenceListRequest!),
    enabled: open && !!evidenceListRequest,
  });

  const verifiedEvidences = useMemo(
    () => evidenceListResponse?.Data?.Data ?? [],
    [evidenceListResponse?.Data?.Data],
  );

  const openEvidencePreview = useCallback((evidenceId: string) => {
    setEvidencePreviewId(evidenceId);
    setIsEvidencePreviewOpen(true);
  }, []);

  const closeEvidencePreview = useCallback((nextOpen: boolean) => {
    setIsEvidencePreviewOpen(nextOpen);
    if (!nextOpen) {
      setEvidencePreviewId(null);
    }
  }, []);

  const { data: evidencePreviewResponse, isFetching: isEvidencePreviewLoading } = useQuery({
    queryKey: createSarEvidencePreviewQueryKey(
      evidencePreviewId,
      verifiedEvidences,
    ),
    queryFn: () => {
      const mappingId = resolveSarEvidencePreviewCycleMapId(
        verifiedEvidences,
        evidencePreviewId,
      );

      return evidenceCycleMapService.getById(mappingId);
    },
    retry: false,
    enabled:
      open &&
      isEvidencePreviewOpen &&
      !!evidencePreviewId &&
      verifiedEvidences.length > 0 &&
      evidenceListResponse?.Success === true,
  });

  const evidencePreviewCycleMap = useMemo<EvidenceCycleMap | null>(() => {
    if (!evidencePreviewResponse?.Data) {
      return null;
    }

    return createSarEvidencePreviewCycleMap(
      evidencePreviewResponse.Data,
      item?.CycleId,
    );
  }, [evidencePreviewResponse?.Data, item?.CycleId]);

  const handleCommentActivated = useCallback((commentId: string) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return;
    }

    const { from, to } = currentEditor.state.selection;
    const canActivateComment = shouldHandleCommentActivated({
      selectionFrom: from,
      selectionTo: to,
      isComposerOpen: showComposerRef.current,
      hasDraft: !!composerDraftRef.current,
    });
    if (!canActivateComment) {
      return;
    }

    const normalizedCommentId = commentId || null;
    setActiveCommentId((prev) => (prev === normalizedCommentId ? prev : normalizedCommentId));
  }, []);

  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        history: sarYdoc ? false : {},
      }),
      ...(sarYdoc ? [Collaboration.configure({ document: sarYdoc })] : []),
      CommentExtension.configure({
        HTMLAttributes: {
          class: "rounded-sm bg-amber-200/70 px-0.5 ring-1 ring-amber-300",
        },
        onCommentActivated: handleCommentActivated,
      }),
      Image.configure({
        HTMLAttributes: {
          style: "max-width: 100%; height: auto; display: block;",
        },
      }),
      EvidenceTag,
    ],
    [handleCommentActivated, sarYdoc],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: editorExtensions,
      content: "",
      editable: false,
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none min-h-[720px] p-8 focus:outline-none",
        },
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          const evidenceId = resolveEvidenceTagClickTargetId({
            type: { name: node.type.name },
            attrs: node.attrs as { evidenceId?: unknown } | undefined,
          });

          if (!evidenceId) {
            return false;
          }

          event.preventDefault();
          openEvidencePreview(evidenceId);
          return true;
        },
      },
    },
    [openEvidencePreview, sarYdoc],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || !sarYdoc) {
      return;
    }

    const nextTocItems: TocItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") {
        return true;
      }

      const text = node.textContent.trim();
      if (!text) {
        return true;
      }

      nextTocItems.push({
        text,
        level: typeof node.attrs.level === "number" ? node.attrs.level : 1,
        pos,
      });

      return true;
    });

    setTocItems(nextTocItems);
  }, [editor, sarYdoc]);

  useEffect(() => {
    if (!editor || !shouldSyncInternalReviewCommentMarks(item?.Status, open, isCommentsLoading)) {
      return;
    }

    const currentCommentIds = new Set(
      visibleComments
        .map((comment) => comment.CommentMarkId?.trim())
        .filter((commentId): commentId is string => !!commentId),
    );
    const staleCommentIds = new Set<string>();

    editor.state.doc.descendants((node) => {
      if (!node.marks.length) {
        return true;
      }

      node.marks.forEach((mark) => {
        if (mark.type.name !== "comment") {
          return;
        }

        const commentId = String(mark.attrs.commentId ?? "").trim();
        if (commentId && !currentCommentIds.has(commentId)) {
          staleCommentIds.add(commentId);
        }
      });

      return true;
    });

    staleCommentIds.forEach((commentId) => {
      editor.commands.unsetComment(commentId);
    });
  }, [editor, isCommentsLoading, item?.Status, open, visibleComments]);

  useEffect(() => {
    if (!open || !editor || editor.isDestroyed || editor.view.isDestroyed) {
      return;
    }

    if (item?.Status === 2) {
      return;
    }

    const markIds = new Set<string>();

    editor.state.doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type.name !== "comment") {
          return;
        }

        const id = String(mark.attrs.commentId ?? "").trim();
        if (id) {
          markIds.add(id);
        }
      });

      return true;
    });

    markIds.forEach((id) => {
      editor.commands.unsetComment(id);
    });
  }, [editor, item?.Status, open]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.view.isDestroyed) {
      return;
    }

    applyCommentMarkVisualState(
      editor.view.dom as HTMLElement,
      activeCommentId,
    );
  }, [activeCommentId, editor, visibleComments]);

  useEffect(() => {
    if (evidenceListResponse && !evidenceListResponse.Success) {
      toast.error(
        evidenceListResponse.Message || "Không tải được danh sách minh chứng",
      );
    }
  }, [evidenceListResponse]);

  useEffect(() => {
    if (evidencePreviewResponse && !evidencePreviewResponse.Success) {
      toast.error(
        evidencePreviewResponse.Message || "Không tải được minh chứng",
      );
    }
  }, [evidencePreviewResponse]);

  useEffect(() => {
    if (!open) {
      closeEvidencePreview(false);
    }
  }, [closeEvidencePreview, open]);

  const scrollToHeading = useCallback(
    (pos: number) => {
      if (!editor || editor.isDestroyed || editor.view.isDestroyed) {
        return;
      }

      const docSize = editor.state.doc.content.size;
      if (docSize < 1) {
        return;
      }

      const safePos = Math.min(Math.max(pos, 0), docSize - 1);

      try {
        const { node } = editor.view.domAtPos(safePos + 1);
        const target =
          node instanceof HTMLElement
            ? node
            : node.parentElement instanceof HTMLElement
              ? node.parentElement
              : null;

        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        // Ignore invalid positions or stale view state to avoid crashing the popup.
      }
    },
    [editor],
  );

  const handleCommentPanelClick = useCallback(
    (comment: InternalComment) => {
      const markId = comment.CommentMarkId ?? comment.Id;
      setActiveCommentId(markId);

      if (!editor || editor.isDestroyed || editor.view.isDestroyed) {
        return;
      }

      const range = comment.CommentMarkId
        ? findMarkRange(editor, comment.CommentMarkId)
        : findTextRange(editor, comment.HighlightedText ?? "");

      if (!range) {
        return;
      }

      try {
        const { node } = editor.view.domAtPos(range.from);
        const target = node instanceof HTMLElement ? node : node.parentElement;
        target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch {
        // Ignore stale view during rapid updates.
      }
    },
    [editor],
  );

  const roleId = item?.CurrentUserCouncilRoleId ?? null;
  const canComment = !!item && item.Status === 2 && roleId !== null && COMMENT_ROLES.has(roleId);
  const canDecide = canDecideInternalReview(item);

  const statusBadgeClass = useMemo(() => {
    switch (item?.Status) {
      case 1:
        return "bg-slate-100 text-slate-700 border border-slate-300";
      case 2:
        return "bg-blue-100 text-blue-700 border border-blue-300";
      case 3:
        return "bg-amber-100 text-amber-700 border border-amber-300";
      case 4:
        return "bg-emerald-100 text-emerald-700 border border-emerald-300";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-300";
    }
  }, [item?.Status]);

  const statusLabel = useMemo(() => {
    switch (item?.Status) {
      case 1:
        return "Nháp";
      case 2:
        return "Đã nộp";
      case 3:
        return "Yêu cầu chỉnh sửa";
      case 4:
        return "Đã phê duyệt";
      default:
        return "--";
    }
  }, [item?.Status]);

  const handleComposerClose = useCallback(() => {
    composerDraftRef.current = null;
    setComposerDraft(null);
    setShowComposer(false);
    setNewCommentText("");
  }, []);

  const currentItemKey = useMemo(
    () => `${item?.SarReportId ?? ""}|${item?.CycleId ?? ""}|${item?.ReviewRound ?? ""}`,
    [item?.CycleId, item?.ReviewRound, item?.SarReportId],
  );

  useEffect(() => {
    if (!open) {
      previousItemKeyRef.current = currentItemKey;
      handleComposerClose();
      setActiveCommentId(null);
      return;
    }

    const previousItemKey = previousItemKeyRef.current;
    if (previousItemKey !== null && previousItemKey !== currentItemKey) {
      handleComposerClose();
      setActiveCommentId(null);
    }

    previousItemKeyRef.current = currentItemKey;
  }, [currentItemKey, handleComposerClose, open]);

  const handleOpenComposer = useCallback(() => {
    if (!editor || !item || !canComment) {
      return;
    }

    const { from, to } = editor.state.selection;
    const highlightedText = editor.state.doc.textBetween(from, to, "\n");
    const draft = buildComposerDraftFromSelection({
      from,
      to,
      highlightedText,
      markId: crypto.randomUUID(),
    });

    if (!draft) {
      toast.error("Hãy bôi đen đoạn văn bản trước khi thêm nhận xét.");
      return;
    }

    composerDraftRef.current = draft;
    setComposerDraft(draft);
    setShowComposer(true);
  }, [canComment, editor, item]);

  const handleAddComment = async () => {
    const currentComposerDraft = composerDraftRef.current ?? composerDraft;
    if (!editor || !item || !canComment || !currentComposerDraft) {
      toast.error("Hãy bôi đen đoạn văn bản trước khi thêm nhận xét.");
      return;
    }

    const commentText = newCommentText.trim();
    if (!commentText) {
      toast.error("Vui lòng nhập nội dung nhận xét.");
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: currentComposerDraft.from, to: currentComposerDraft.to })
      .setComment(currentComposerDraft.markId)
      .run();

    try {
      await addComment({
        CycleId: item.CycleId,
        CommentText: commentText,
        HighlightedText: currentComposerDraft.highlightedText,
        CommentMarkId: currentComposerDraft.markId,
      });

      broadcastCommentChange();
      handleComposerClose();
      toast.success("Đã thêm nhận xét.");
      onDataChanged();
    } catch {
      editor.commands.unsetComment(currentComposerDraft.markId);
      handleComposerClose();
    }
  };

  const handleDeleteComment = async (commentId: string, markId?: string | null) => {
    setDeletingCommentId(commentId);
    try {
      await deleteComment(commentId);
      if (editor && markId) {
        editor.commands.unsetComment(markId);
      }
      broadcastCommentChange();
      toast.success("Đã xóa nhận xét.");
      onDataChanged();
    } catch {
      // Error toast is already handled by useInternalReviewComments mutation onError.
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleApprove = async (): Promise<boolean> => {
    if (!item) {
      return false;
    }

    setIsDecisionLoading(true);
    try {
      const response = await internalReviewService.approveSar({
        CycleId: item.CycleId,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể phê duyệt SAR.");
      }

      toast.success("Đã phê duyệt SAR.");
      onDataChanged();
      onOpenChange(false);
      return true;
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể phê duyệt SAR.",
      );
      return false;
    } finally {
      setIsDecisionLoading(false);
    }
  };

  const handleRequestRevision = async (reason: string): Promise<boolean> => {
    if (!item) {
      return false;
    }

    setIsDecisionLoading(true);
    try {
      const response = await internalReviewService.requestRevision({
        CycleId: item.CycleId,
        RevisionReason: reason,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể gửi yêu cầu chỉnh sửa.");
      }

      toast.success("Đã gửi yêu cầu chỉnh sửa.");
      onDataChanged();
      onOpenChange(false);
      return true;
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể gửi yêu cầu chỉnh sửa.",
      );
      return false;
    } finally {
      setIsDecisionLoading(false);
    }
  };

  const handleExportDocx = async () => {
    if (!item) {
      return;
    }

    setIsExporting(true);
    try {
      const blob = await sarService.exportDocx({ CycleId: item.CycleId });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `SAR_${item.CycleName}_${item.Year}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Đã xuất file Word.");
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể xuất file Word.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-screen w-screen max-w-[100vw] sm:max-w-[100vw] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-none border-0 p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Internal review</DialogTitle>

        <header className="sticky top-0 z-30 border-b bg-white px-6 py-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <PopupInternalReviewHeaderTitle
                title={item ? `${item.CycleName} (${item.Year})` : "--"}
              />
              <PopupInternalReviewHeaderMeta
                statusLabel={statusLabel}
                statusBadgeClass={statusBadgeClass}
                reviewRound={item?.ReviewRound}
                evaluationPurpose={item?.EvaluationPurpose}
              />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div
                className="flex items-center gap-2"
                title={isConnected ? "Kết nối cộng tác" : "Đang kết nối cộng tác"}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    isConnected ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                <PopupInternalReviewCollaborators collaborators={collaborators} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleExportDocx();
                }}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 h-4 w-4" />
                )}
                Xuất Word
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <aside
            className={`shrink-0 overflow-hidden border-r bg-white transition-all duration-200 ease-in-out ${
              isSidebarOpen ? "w-[220px]" : "w-0 border-r-0"
            }`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b px-3 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Mục lục</h3>
                  <p className="text-xs text-slate-500">{tocItems.length} đề mục</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Thu gọn mục lục"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              <nav className="flex-1 overflow-y-auto px-2 py-3">
                {tocItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    Không có đề mục trong nội dung này.
                  </div>
                ) : (
                  tocItems.map((tocItem) => (
                    <button
                      key={`${tocItem.pos}-${tocItem.text}`}
                      type="button"
                      onClick={() => scrollToHeading(tocItem.pos)}
                      className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm transition hover:bg-slate-100 ${
                        tocItem.level === 1
                          ? "font-semibold text-slate-900"
                          : "font-normal text-slate-600"
                      }`}
                      style={{
                        paddingLeft: `${12 + Math.max(tocItem.level - 1, 0) * 12}px`,
                      }}
                      title={tocItem.text}
                    >
                      {tocItem.text}
                    </button>
                  ))
                )}
              </nav>
            </div>
          </aside>

          {!isSidebarOpen ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="absolute left-0 top-6 z-20 -translate-x-1/2 bg-white shadow-sm"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Mở mục lục"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}

          <div className="flex flex-1 min-w-0 overflow-hidden bg-slate-100">
            <div className="flex-1 min-w-0 overflow-y-auto px-6 py-8">
              {!editor ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="mx-auto max-w-[760px] rounded border bg-white shadow-lg">
                  {canComment ? (
                    <BubbleMenu
                      editor={editor}
                      shouldShow={({ from, to }) =>
                        shouldShowCommentComposerBubble({ from, to }, showComposer)
                      }
                      tippyOptions={{
                        duration: 120,
                        onClickOutside: () => {
                          handleComposerClose();
                        },
                      }}
                    >
                      <div className="space-y-2 rounded-lg border bg-white p-2 shadow-lg">
                        {!showComposer ? (
                          <Button
                            type="button"
                            size="sm"
                            onMouseDown={(event) => {
                              // Keep ProseMirror selection before onClick reads selected range.
                              event.preventDefault();
                            }}
                            onClick={() => {
                              handleOpenComposer();
                            }}
                          >
                            + Thêm nhận xét
                          </Button>
                        ) : composerDraft ? (
                          <div className="flex w-72 flex-col gap-2">
                            <PopupInternalReviewComposerSnippetPreview
                              highlightedText={composerDraft.highlightedText}
                            />
                            <Input
                              value={newCommentText}
                              onChange={(event) => setNewCommentText(event.target.value)}
                              placeholder="Nhập nội dung nhận xét"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  handleComposerClose();
                                }}
                              >
                                Hủy
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void handleAddComment();
                                }}
                                disabled={isAdding || newCommentText.trim().length === 0}
                              >
                                Lưu
                              </Button>
                            </div>
                          </div>
                        ) : null
                        }
                      </div>
                    </BubbleMenu>
                  ) : null}
                  <EditorContent editor={editor} />
                </div>
              )}
            </div>
          </div>

          <div className="w-[360px] shrink-0">
            <CommentPanel
              comments={visibleComments}
              activeCommentId={activeCommentId}
              currentUsername={user?.Username}
              deletingCommentId={deletingCommentId}
              onDeleteComment={(comment) => {
                void handleDeleteComment(comment.Id, comment.CommentMarkId);
              }}
              onCommentClick={handleCommentPanelClick}
            />
          </div>
        </div>

        {canDecide ? (
          <DecisionToolbar
            canDecide={canDecide}
            isSubmitting={isDecisionLoading || isCommentsLoading}
            onApprove={handleApprove}
            onRequestRevision={handleRequestRevision}
          />
        ) : null}
      </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <PopupEvidenceCycleMap
          evidenceCycleMap={evidencePreviewCycleMap}
          isOpen={isEvidencePreviewOpen}
          onOpenChange={closeEvidencePreview}
          saveChange={() => {
            // Read-only preview mode: no save action.
          }}
          onApprove={() => {
            // Read-only preview mode: no approve action.
          }}
          readOnly
          isLoading={isEvidencePreviewLoading}
        />
      </Suspense>
    </>
  );
}
