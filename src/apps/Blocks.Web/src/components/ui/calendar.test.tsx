import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Calendar } from "./calendar";

describe("Calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders_vietnamese_caption_keyboard_navigation_and_selection", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 9, 24)}
        selected={new Date(2026, 9, 24)}
        captionLayout="dropdown"
        onSelect={onSelect}
      />
    );

    const normalizedMonthText = (container.textContent || "").toLowerCase();
    expect(normalizedMonthText).toMatch(/(thg\.?\s*10|tháng\s*10)/i);

    const day24Button = screen.getByRole("button", {
      name: (_content, element) =>
        element?.tagName.toLowerCase() === "button" &&
        element?.textContent?.trim() === "24",
    });

    fireEvent.focus(day24Button);
    expect(document.activeElement).toBe(day24Button);

    fireEvent.keyDown(day24Button, { key: "ArrowRight", code: "ArrowRight" });

    const day25Button = screen.getByRole("button", {
      name: (_content, element) =>
        element?.tagName.toLowerCase() === "button" &&
        element?.textContent?.trim() === "25",
    });

    expect(document.activeElement).toBe(day25Button);

    // Activate focused day
    fireEvent.click(document.activeElement!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const emitted = onSelect.mock.calls[0][0];
    expect([
      emitted.getFullYear(),
      emitted.getMonth(),
      emitted.getDate(),
    ]).toEqual([2026, 9, 25]);
  });
});
