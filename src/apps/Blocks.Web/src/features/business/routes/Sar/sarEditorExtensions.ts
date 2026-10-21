import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TableOfContents from "@tiptap/extension-table-of-contents";
import type { TableOfContentData } from "@tiptap/extension-table-of-contents";
import Image from "@tiptap/extension-image";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { EvidenceTag } from "./extensions/EvidenceTag";

export interface TocItem {
  id: string;
  level: number;
  text: string;
  dom: HTMLElement | null;
  isActive: boolean;
  isScrolledOver: boolean;
}

export interface SarEditorCommentExtensionOptions {
  onCommentActivated?: (commentId: string) => void;
}

export function createSarEditorExtensions(
  ydoc: Y.Doc | null,
  provider?: WebsocketProvider | null,
  onTocUpdate?: (items: TocItem[]) => void,
  userInfo?: { name: string; color: string },
  commentOptions: SarEditorCommentExtensionOptions = {},
): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      history: ydoc ? false : {},
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Link.configure({
      openOnClick: true,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({
      HTMLAttributes: {
        style: "max-width: 100%; height: auto; display: block;",
      },
    }),
    CommentExtension.configure({
      HTMLAttributes: {
        class: "rounded-sm bg-amber-200/70 px-0.5 ring-1 ring-amber-300",
      },
      ...commentOptions,
    }),
    EvidenceTag,
  ];

  if (onTocUpdate) {
    extensions.push(
      TableOfContents.configure({
        onUpdate: (data: TableOfContentData) => {
          onTocUpdate(
            data.map((item) => ({
              id: item.id,
              level: item.level,
              text: item.textContent,
              dom: item.dom,
              isActive: item.isActive,
              isScrolledOver: item.isScrolledOver,
            })),
          );
        },
      }),
    );
  }

  if (ydoc) {
    extensions.push(
      Collaboration.configure({
        document: ydoc,
      }),
    );

    if (provider) {
      extensions.push(
        CollaborationCursor.configure({
          provider,
          user: {
            name: userInfo?.name ?? null,
            color: userInfo?.color ?? null,
          },
        }),
      );
    }
  }

  return extensions;
}
