import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserverMock,
    writable: true,
  })
}

if (typeof window !== "undefined" && !("PointerEvent" in globalThis)) {
  const BaseMouseEvent = globalThis.MouseEvent ?? class {}

  class PointerEventMock extends BaseMouseEvent {}

  Object.defineProperty(globalThis, "PointerEvent", {
    value: PointerEventMock,
    writable: true,
  })
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const elementPrototype = globalThis.HTMLElement?.prototype

if (elementPrototype && !("scrollIntoView" in elementPrototype)) {
  Object.defineProperty(elementPrototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  })
}
