import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StrictMode } from "react";
import { MotionCanvas } from "./MotionCanvas";

class MockMediaQueryList extends EventTarget {
  matches: boolean;
  readonly media: string;

  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }

  addListener(listener: EventListener) {
    this.addEventListener("change", listener);
  }

  removeListener(listener: EventListener) {
    this.removeEventListener("change", listener);
  }
}

interface CanvasMocks {
  ctx: {
    clearRect: ReturnType<typeof vi.fn>;
    setTransform: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
  };
  pending: Map<number, FrameRequestCallback>;
  stepFrame: (timestamp: number) => void;
  setReduced: (value: boolean) => void;
  setHidden: (value: boolean) => void;
  setViewport: (w: number, h: number, dpr: number) => void;
  setContextNull: (value: boolean) => void;
  activeCanvasListeners: () => Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }>;
  restore: () => void;
}

let activeMocks: CanvasMocks | null = null;

function installCanvasMocks(options?: { returnNull?: boolean }): CanvasMocks {
  if (activeMocks) {
    activeMocks.restore();
  }

  let isContextNull = options?.returnNull ?? false;
  let visibility: DocumentVisibilityState = "visible";
  let reducedMatches = false;

  const mockCtx = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };

  const pending = new Map<number, FrameRequestCallback>();
  let nextRafId = 1;

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;
  const originalMatchMedia = window.matchMedia;
  const originalWindowAdd = window.addEventListener;
  const originalWindowRemove = window.removeEventListener;
  const originalDocAdd = document.addEventListener;
  const originalDocRemove = document.removeEventListener;

  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalDpr = window.devicePixelRatio;

  const trackedListeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  const CANVAS_EVENT_TYPES = [
    "resize",
    "pointermove",
    "pointerleave",
    "visibilitychange",
    "change",
  ];

  const mqlInstance = new MockMediaQueryList(
    "(prefers-reduced-motion: reduce)",
    reducedMatches
  );

  const origMqlAdd = mqlInstance.addEventListener.bind(mqlInstance);
  const origMqlRemove = mqlInstance.removeEventListener.bind(mqlInstance);

  mqlInstance.addEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      trackedListeners.push({ target: mqlInstance, type, listener });
    }
    return origMqlAdd(type, listener, opts);
  };

  mqlInstance.removeEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      const idx = trackedListeners.findIndex(
        (e) =>
          e.target === mqlInstance &&
          e.type === type &&
          e.listener === listener
      );
      if (idx !== -1) {
        trackedListeners.splice(idx, 1);
      }
    }
    return origMqlRemove(type, listener, opts);
  };

  window.addEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      trackedListeners.push({ target: window, type, listener });
    }
    return originalWindowAdd.call(window, type, listener, opts);
  };

  window.removeEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      const idx = trackedListeners.findIndex(
        (e) =>
          e.target === window && e.type === type && e.listener === listener
      );
      if (idx !== -1) {
        trackedListeners.splice(idx, 1);
      }
    }
    return originalWindowRemove.call(window, type, listener, opts);
  };

  document.addEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      trackedListeners.push({ target: document, type, listener });
    }
    return originalDocAdd.call(document, type, listener, opts);
  };

  document.removeEventListener = function (
    type: string,
    listener: any,
    opts?: any
  ) {
    if (CANVAS_EVENT_TYPES.includes(type)) {
      const idx = trackedListeners.findIndex(
        (e) =>
          e.target === document && e.type === type && e.listener === listener
      );
      if (idx !== -1) {
        trackedListeners.splice(idx, 1);
      }
    }
    return originalDocRemove.call(document, type, listener, opts);
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(function (
    this: HTMLCanvasElement,
    contextId: string
  ) {
    if (contextId === "2d") {
      return isContextNull ? null : (mockCtx as unknown as RenderingContext);
    }
    return null;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback): number => {
    const id = nextRafId++;
    pending.set(id, cb);
    return id;
  });

  window.cancelAnimationFrame = vi.fn((id: number): void => {
    pending.delete(id);
  });

  window.matchMedia = vi.fn((query: string) => {
    if (query.includes("prefers-reduced-motion")) {
      return mqlInstance as unknown as MediaQueryList;
    }
    return new MockMediaQueryList(query, false) as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => visibility === "hidden",
  });

  const stepFrame = (timestamp: number) => {
    const entries = Array.from(pending.entries());
    pending.clear();
    for (const [, cb] of entries) {
      cb(timestamp);
    }
  };

  const setReduced = (value: boolean) => {
    reducedMatches = value;
    mqlInstance.matches = value;
    mqlInstance.dispatchEvent(new Event("change"));
  };

  const setHidden = (value: boolean) => {
    visibility = value ? "hidden" : "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  };

  const setViewport = (w: number, h: number, dpr: number) => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: w,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: h,
    });
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      writable: true,
      value: dpr,
    });
  };

  const setContextNull = (value: boolean) => {
    isContextNull = value;
  };

  const restore = () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    window.matchMedia = originalMatchMedia;
    window.addEventListener = originalWindowAdd;
    window.removeEventListener = originalWindowRemove;
    document.addEventListener = originalDocAdd;
    document.removeEventListener = originalDocRemove;

    delete (document as any).visibilityState;
    delete (document as any).hidden;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      writable: true,
      value: originalDpr,
    });

    trackedListeners.length = 0;
    pending.clear();
    activeMocks = null;
  };

  activeMocks = {
    ctx: mockCtx,
    pending,
    stepFrame,
    setReduced,
    setHidden,
    setViewport,
    setContextNull,
    activeCanvasListeners: () => [...trackedListeners],
    restore,
  };

  return activeMocks;
}

afterEach(() => {
  if (activeMocks) {
    activeMocks.restore();
  }
  cleanup();
});

describe("MotionCanvas", () => {
  it("decorative_canvas_draws_and_schedules_one_frame", () => {
    const { ctx, pending, stepFrame } = installCanvasMocks();
    const { container } = render(<MotionCanvas />);
    const canvas = container.querySelector("canvas")!;

    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("fixed", "inset-0", "pointer-events-none");
    expect(
      ctx.fillRect.mock.calls.length + ctx.arc.mock.calls.length
    ).toBeGreaterThan(0);

    stepFrame(16);
    expect(pending.size).toBe(1);
  });

  it("reduced_motion_at_mount_is_static", () => {
    const { ctx, pending, setReduced } = installCanvasMocks();
    setReduced(true);

    render(<MotionCanvas />);

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(pending.size).toBe(0);
  });

  it("hidden_and_reduced_transitions_never_duplicate_raf", () => {
    const { pending, setReduced, setHidden } = installCanvasMocks();
    render(<MotionCanvas />);
    expect(pending.size).toBe(1);

    // Hide, enable reduced, show: expect(pending.size).toBe(0)
    setHidden(true);
    setReduced(true);
    setHidden(false);
    expect(pending.size).toBe(0);

    // disable reduced while visible: expect(pending.size).toBe(1)
    setReduced(false);
    expect(pending.size).toBe(1);

    // repeated show keeps 1
    setHidden(false);
    expect(pending.size).toBe(1);

    // reduced cancels to 0
    setReduced(true);
    expect(pending.size).toBe(0);
  });

  it("resize_caps_dpr_and_replaces_transform", () => {
    const { ctx, setViewport } = installCanvasMocks();
    setViewport(390, 844, 3);

    const { container } = render(<MotionCanvas />);
    const canvas = container.querySelector("canvas")!;

    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(1688);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);

    window.dispatchEvent(new Event("resize"));

    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(1688);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("strictmode_unmount_releases_every_resource", () => {
    const { ctx, pending, stepFrame, setReduced, activeCanvasListeners } =
      installCanvasMocks();

    const { unmount } = render(
      <StrictMode>
        <MotionCanvas />
      </StrictMode>
    );

    expect(pending.size).toBe(1);
    unmount();
    expect(pending.size).toBe(0);

    // registrations match removed callbacks
    expect(activeCanvasListeners().length).toBe(0);

    // events after unmount cause no more paint
    const initialPaintCalls =
      ctx.clearRect.mock.calls.length +
      ctx.fillRect.mock.calls.length +
      ctx.arc.mock.calls.length;

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("pointermove"));
    window.dispatchEvent(new Event("pointerleave"));
    document.dispatchEvent(new Event("visibilitychange"));
    setReduced(true);
    stepFrame(32);

    const finalPaintCalls =
      ctx.clearRect.mock.calls.length +
      ctx.fillRect.mock.calls.length +
      ctx.arc.mock.calls.length;

    expect(finalPaintCalls).toBe(initialPaintCalls);
  });

  it("missing_context_is_nonfatal", () => {
    const { pending, setContextNull } = installCanvasMocks();
    setContextNull(true);

    expect(() => render(<MotionCanvas />)).not.toThrow();
    expect(pending.size).toBe(0);
  });
});
