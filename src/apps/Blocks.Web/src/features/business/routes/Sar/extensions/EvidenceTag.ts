import { mergeAttributes, Node } from "@tiptap/core";

export const EVIDENCE_TAG_MIME = "application/x-aun-evidence";

export interface EvidenceTagAttrs {
  evidenceId: string;
  evidenceCode: string;
  evidenceName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function encodeEvidenceTagTransfer(data: EvidenceTagAttrs): string {
  return JSON.stringify(data);
}

export function decodeEvidenceTagTransfer(raw: string | null | undefined): EvidenceTagAttrs | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const evidenceId = typeof parsed.evidenceId === "string" ? parsed.evidenceId.trim() : "";
    const evidenceCode = typeof parsed.evidenceCode === "string" ? parsed.evidenceCode.trim() : "";
    const evidenceName =
      typeof parsed.evidenceName === "string" ? parsed.evidenceName.trim() : undefined;

    if (!evidenceId || !evidenceCode) {
      return null;
    }

    return {
      evidenceId,
      evidenceCode,
      evidenceName: evidenceName || undefined,
    };
  } catch {
    return null;
  }
}

export const EvidenceTag = Node.create({
  name: "evidenceTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      evidenceId: {
        default: "",
      },
      evidenceCode: {
        default: "",
      },
      evidenceName: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-evidence-id][data-evidence-code]",
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) {
            return false;
          }

          return {
            evidenceId: dom.getAttribute("data-evidence-id") ?? "",
            evidenceCode: dom.getAttribute("data-evidence-code") ?? "",
            evidenceName: dom.getAttribute("data-evidence-name") ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const evidenceId = String(node.attrs.evidenceId ?? "");
    const evidenceCode = String(node.attrs.evidenceCode ?? "");
    const evidenceName = node.attrs.evidenceName ? String(node.attrs.evidenceName) : null;

    return [
      "span",
      mergeAttributes({
        "data-evidence-id": evidenceId,
        "data-evidence-code": evidenceCode,
        "data-evidence-name": evidenceName ?? undefined,
        "data-type": "evidence-tag",
        class:
          "inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[0.8em] font-medium text-slate-700 align-baseline cursor-pointer hover:border-blue-300 hover:bg-blue-50",
        title: evidenceName ?? evidenceCode,
      }),
      `[${evidenceCode}]`,
    ];
  },
});
