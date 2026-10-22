import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PopupSarEditor from "./PopupSarEditor";
import { fileService } from "@/features/file/api/uploadfile.api";
import { toast } from "sonner";
import { useAvatarUrl } from "@/features/file/hooks/useAvatarUrl";

let mockEditorDom: HTMLDivElement;
const mockSetImage = vi.fn();

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => {
    mockEditorDom = document.createElement("div");
    return {
      view: { dom: mockEditorDom, isDestroyed: false },
      commands: {
        setImage: mockSetImage,
        insertContentAt: vi.fn(),
        toggleBold: vi.fn(),
        toggleItalic: vi.fn(),
        toggleUnderline: vi.fn(),
        setLink: vi.fn(),
        unsetAllMarks: vi.fn(),
        addRowBefore: vi.fn(),
        addRowAfter: vi.fn(),
        deleteRow: vi.fn(),
        addColumnBefore: vi.fn(),
        addColumnAfter: vi.fn(),
        deleteColumn: vi.fn(),
        deleteTable: vi.fn(),
        unsetComment: vi.fn(),
      },
      state: {
        doc: {
          content: { size: 0 },
          descendants: vi.fn(),
        },
        selection: { from: 0 },
      },
      isActive: vi.fn(() => false), can: vi.fn(() => ({ undo: vi.fn(() => true), redo: vi.fn(() => true) })),
      setEditable: vi.fn(),
      getHTML: vi.fn(() => "<p></p>"),
      isDestroyed: false,
      destroy: vi.fn(),
    };
  }),
  EditorContent: () => <div data-testid="editor-content" />,
  BubbleMenu: () => null,
}));

let awarenessListeners: Array<() => void> = [];
let awarenessStates = new Map<number, any>();
let localAwarenessState: any = null;

const mockAwareness = {
  clientID: 1,
  getStates: () => awarenessStates,
  setLocalStateField: vi.fn((field, value) => {
    if (field === "user") {
      localAwarenessState = value;
    }
  }),
  on: vi.fn((event, cb) => {
    if (event === "change") awarenessListeners.push(cb);
  }),
  off: vi.fn((_event, cb) => {
    awarenessListeners = awarenessListeners.filter((l) => l !== cb);
  }),
};

vi.mock("y-websocket", () => ({
  WebsocketProvider: vi.fn().mockImplementation(function (this: any) { return {
    awareness: mockAwareness,
    on: vi.fn((event, cb) => {
      if (event === "status") cb({ status: "connected" });
    }),
    destroy: vi.fn(),
  }; }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      Id: "u-1",
      Fullname: "Nguyen Van A",
      Avatar: "System/Avatar/11111111-1111-1111-1111-111111111111.png",
    },
    isAuthenticated: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "loading-id"),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/features/file/api/uploadfile.api", () => ({
  fileService: {
    uploadFileEmbed: vi.fn(),
  },
}));

vi.mock("@/features/file/hooks/useAvatarUrl", () => ({
  useAvatarUrl: vi.fn((source?: string | null) => {
    if (!source) return undefined;
    return `blob:http://localhost/resolved-${source.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }),
}));

vi.mock("./SarEditorToolbar", () => ({ SarEditorToolbar: () => null }));
vi.mock("./sarEditorExtensions", () => ({
  createSarEditorExtensions: vi.fn(() => []),
}));

vi.mock("@/features/business/hooks/useInternalReviewComments", () => ({
  useInternalReviewComments: () => ({ comments: [], activeComment: null }),
}));

vi.mock("@/features/business/hooks/useSarWatermark", () => ({
  useSarWatermark: () => ({ watermark: null }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/features/business/api/sar.api", () => ({
  sarService: {
    exportDocx: vi.fn(),
    getAutofillPayload: vi.fn(),
  },
}));

vi.mock("@/features/business/api/evidenceCycleMap.api", () => ({
  evidenceCycleMapService: {
    getList: vi.fn(),
  },
}));

describe("PopupSarEditor hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    awarenessListeners = [];
    awarenessStates = new Map();
    localAwarenessState = null;
  });

  const baseProps = {
    open: true,
    cycle: {
      CycleId: "cycle-1",
      CycleName: "Chu kỳ 2026",
      Status: 1,
    } as any,
    draft: {
      SarReportId: "report-1",
      Content: "",
      Status: 1,
    } as any,
    isDraftLoading: false,
    isSubmitting: false,
    canSubmitByRole: true,
    canEditByRole: true,
    onOpenChange: vi.fn(),
    onSaveDraft: vi.fn().mockResolvedValue(true),
    onSubmitSar: vi.fn().mockResolvedValue(true),
    onRefreshDraft: vi.fn(),
  };

  it("sar_embed_is_explicitly_retired", async () => {
    render(<PopupSarEditor {...baseProps} />);

    expect(mockEditorDom).toBeDefined();

    const imageFile = new File(["fake-image-bytes"], "photo.png", {
      type: "image/png",
    });

    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
      },
    });

    mockEditorDom.dispatchEvent(pasteEvent);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/chèn ảnh/i),
      );
    });

    expect(fileService.uploadFileEmbed).not.toHaveBeenCalled();
    expect(mockSetImage).not.toHaveBeenCalled();
  });

  it("SAR avatar native image uses resolved private blob rather than static URL", async () => {
    const peerAvatarKey =
      "System/Avatar/22222222-2222-2222-2222-222222222222.png";

    awarenessStates.set(2, {
      user: {
        name: "Peer Reviewer",
        initials: "PR",
        color: "#10b981",
        avatar: peerAvatarKey,
      },
    });

    render(<PopupSarEditor {...baseProps} />);

    // Trigger awareness update so collaborators state gets populated
    act(() => { awarenessListeners.forEach((listener) => listener()); });

    // 1. Verify awareness local state receives logical key, not getFileUrl or blob URL
    expect(localAwarenessState).toBeDefined();
    expect(localAwarenessState.avatar).toBe(
      "System/Avatar/11111111-1111-1111-1111-111111111111.png",
    );
    expect(localAwarenessState.avatar).not.toContain("http");
    expect(localAwarenessState.avatar).not.toContain("blob:");

    // 2. Verify collaborator avatar rendered uses resolved blob URL, not static URL
    const peerImg = await screen.findByAltText("Peer Reviewer");
    expect(peerImg).toBeInTheDocument();
    expect(peerImg.getAttribute("src")).toContain("blob:http://localhost/resolved-");
    expect(peerImg.getAttribute("src")).not.toContain("https://localhost:7213/File/");
    expect(useAvatarUrl).toHaveBeenCalledWith(peerAvatarKey);
  });
});