import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MultipleSelector from "./multi-select";

const OPTIONS = [
  { value: "user-1", label: "Assignee 1" },
  { value: "user-2", label: "Assignee 2" },
  { value: "user-3", label: "Assignee 3" },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function mockRect(element: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.left ?? 100,
    y: rect.top ?? 120,
    top: rect.top ?? 120,
    left: rect.left ?? 100,
    bottom: rect.bottom ?? 160,
    right: rect.right ?? 420,
    width: rect.width ?? 320,
    height: rect.height ?? 40,
    toJSON: () => ({}),
  } as DOMRect);
}

function renderSelector(props?: {
  keepOpenOnSelect?: boolean;
  portalContainer?: HTMLElement | null;
}) {
  const { container } = render(
    <MultipleSelector
      options={OPTIONS}
      placeholder="Add assignee..."
      keepOpenOnSelect={props?.keepOpenOnSelect}
      portalContainer={props?.portalContainer ?? null}
    />,
  );

  const root = container.querySelector("[data-slot='command']") as HTMLDivElement;
  const input = screen.getByPlaceholderText("Add assignee...");

  return { root, input };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  setViewport(1280, 720);
});

describe("MultipleSelector dropdown positioning", () => {
  it("renders dropdown into the provided portal container", async () => {
    const portalHost = document.createElement("div");
    portalHost.setAttribute("data-testid", "portal-host");
    document.body.appendChild(portalHost);

    const { root, input } = renderSelector({ portalContainer: portalHost });
    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);

    await waitFor(() => {
      const dropdown = portalHost.querySelector("[data-ms-dropdown='true']");
      expect(dropdown).toBeInTheDocument();
    });
  });

  it("flips the dropdown upward when there is not enough room below", async () => {
    setViewport(1280, 460);

    const { root, input } = renderSelector();
    mockRect(root, {
      top: 380,
      left: 100,
      width: 320,
      height: 40,
      bottom: 420,
    });

    fireEvent.focus(input);

    await waitFor(() => {
      const dropdown = document.querySelector(
        "[data-ms-dropdown='true']",
      ) as HTMLDivElement | null;

      expect(dropdown).toBeInTheDocument();
      expect(dropdown?.dataset.placement).toBe("top");
      expect(Number.parseFloat(dropdown?.style.top ?? "0")).toBeLessThan(380);
    });
  });

  it("clamps the dropdown horizontally within the viewport", async () => {
    setViewport(360, 640);

    const { root, input } = renderSelector();
    mockRect(root, {
      top: 160,
      left: 280,
      width: 300,
      height: 40,
      bottom: 200,
    });

    fireEvent.focus(input);

    await waitFor(() => {
      const dropdown = document.querySelector(
        "[data-ms-dropdown='true']",
      ) as HTMLDivElement | null;

      expect(dropdown).toBeInTheDocument();
      expect(Number.parseFloat(dropdown?.style.left ?? "0")).toBeLessThanOrEqual(
        48,
      );
      expect(Number.parseFloat(dropdown?.style.width ?? "0")).toBeLessThanOrEqual(
        336,
      );
    });
  });

  describe("MultipleSelector portal host resolution", () => {
    it("renders dropdown into document.body when no portalContainer is given, even inside a dialog", async () => {
      const dialogContent = document.createElement("div");
      dialogContent.setAttribute("data-slot", "dialog-content");
      document.body.appendChild(dialogContent);

      render(
        <MultipleSelector options={OPTIONS} placeholder="Add assignee..." />,
        { container: dialogContent },
      );

      const root = dialogContent.querySelector(
        "[data-slot='command']",
      ) as HTMLDivElement;
      const input = screen.getByPlaceholderText("Add assignee...");

      mockRect(root, {
        top: 120,
        left: 100,
        width: 320,
        height: 40,
        bottom: 160,
      });

      fireEvent.focus(input);

      await waitFor(() => {
        const dropdown = document.querySelector(
          "[data-ms-dropdown='true']",
        ) as HTMLDivElement | null;

        expect(dropdown).toBeInTheDocument();
        expect(dropdown?.parentElement).toBe(document.body);
        expect(dialogContent.contains(dropdown)).toBe(false);
      });
    });
  });

  it("stops wheel propagation from the dropdown scroll container", async () => {
    const bodyWheelSpy = vi.fn();
    document.body.addEventListener("wheel", bodyWheelSpy);

    const { root, input } = renderSelector();
    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);

    const scrollContainer = await screen.findByTestId(
      "multi-select-scroll-container",
    );
    fireEvent.wheel(scrollContainer, { deltaY: 120 });

    expect(bodyWheelSpy).not.toHaveBeenCalled();

    document.body.removeEventListener("wheel", bodyWheelSpy);
  });

  it("clears the search text after selecting an option by default", async () => {
    const { root, input } = renderSelector();
    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Assignee 1" } });

    await waitFor(() => {
      expect(input).toHaveValue("Assignee 1");
    });

    fireEvent.mouseDown(screen.getByText("Assignee 1"));

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("keeps the search text after selecting an option when keepOpenOnSelect is true", async () => {
    const { root, input } = renderSelector({ keepOpenOnSelect: true });
    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Assignee 1" } });

    await waitFor(() => {
      expect(input).toHaveValue("Assignee 1");
    });

    fireEvent.mouseDown(screen.getByText("Assignee 1"));

    await waitFor(() => {
      expect(input).toHaveValue("Assignee 1");
    });
  });

  it("keeps the dropdown open after selecting an option when keepOpenOnSelect is true", async () => {
    const { root, input } = renderSelector({ keepOpenOnSelect: true });
    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);

    const scrollContainer = await screen.findByTestId(
      "multi-select-scroll-container",
    );
    fireEvent.mouseDown(within(scrollContainer).getByText("Assignee 1"));

    await waitFor(() => {
      const openScrollContainer = screen.getByTestId(
        "multi-select-scroll-container",
      );
      expect(
        within(openScrollContainer).getByText("Assignee 2"),
      ).toBeInTheDocument();
    });
  });

  it("keeps the dropdown open after a controlled value update when keepOpenOnSelect is true", async () => {
    function ControlledHost() {
      const [value, setValue] = React.useState<typeof OPTIONS>([]);

      return (
        <MultipleSelector
          value={value}
          options={OPTIONS}
          keepOpenOnSelect
          placeholder="Add assignee..."
          onChange={setValue}
        />
      );
    }

    const { container } = render(<ControlledHost />);
    const root = container.querySelector("[data-slot='command']") as HTMLDivElement;
    const input = screen.getByPlaceholderText("Add assignee...");

    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);

    const scrollContainer = await screen.findByTestId(
      "multi-select-scroll-container",
    );
    fireEvent.mouseDown(within(scrollContainer).getByText("Assignee 1"));

    await waitFor(() => {
      const openScrollContainer = screen.getByTestId(
        "multi-select-scroll-container",
      );
      expect(
        within(openScrollContainer).getByText("Assignee 2"),
      ).toBeInTheDocument();
    });
  });

  it("keeps the dropdown open in controlled mode when options come from defaultOptions", async () => {
    function ControlledDefaultOptionsHost() {
      const [value, setValue] = React.useState<typeof OPTIONS>([]);

      return (
        <MultipleSelector
          value={value}
          defaultOptions={OPTIONS}
          keepOpenOnSelect
          placeholder="Add assignee..."
          onChange={setValue}
        />
      );
    }

    const { container } = render(<ControlledDefaultOptionsHost />);
    const root = container.querySelector("[data-slot='command']") as HTMLDivElement;
    const input = screen.getByPlaceholderText("Add assignee...");

    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);

    const scrollContainer = await screen.findByTestId(
      "multi-select-scroll-container",
    );
    fireEvent.mouseDown(within(scrollContainer).getByText("Assignee 1"));

    await waitFor(() => {
      const openScrollContainer = screen.getByTestId(
        "multi-select-scroll-container",
      );
      expect(
        within(openScrollContainer).getByText("Assignee 2"),
      ).toBeInTheDocument();
    });
  });

  it("updates dropdown options when defaultOptions changes after mount", async () => {
    function AsyncDefaultOptionsHost() {
      const [defaultOptions, setDefaultOptions] = React.useState<
        typeof OPTIONS
      >([]);

      return (
        <>
          <button type="button" onClick={() => setDefaultOptions(OPTIONS)}>
            Load options
          </button>
          <MultipleSelector
            defaultOptions={defaultOptions}
            keepOpenOnSelect
            placeholder="Add assignee..."
          />
        </>
      );
    }

    const { container } = render(<AsyncDefaultOptionsHost />);
    const root = container.querySelector("[data-slot='command']") as HTMLDivElement;
    const input = screen.getByPlaceholderText("Add assignee...");

    mockRect(root, {
      top: 120,
      left: 100,
      width: 320,
      height: 40,
      bottom: 160,
    });

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Load options" }));

    await waitFor(() => {
      const openScrollContainer = screen.getByTestId(
        "multi-select-scroll-container",
      );
      expect(
        within(openScrollContainer).getByText("Assignee 1"),
      ).toBeInTheDocument();
    });
  });
});
