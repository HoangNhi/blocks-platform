import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DatePicker } from "./datepicker";

describe("DatePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats_controlled_date_and_emits_selected_local_date", async () => {
    const onChange = vi.fn();
    const controlledDate = new Date(2026, 9, 24);

    render(
      <DatePicker
        value={controlledDate}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("24/10/2026");

    fireEvent.click(trigger);

    // Look for day 25 button
    const day25Button = screen.getByRole("button", { name: (_content, element) => {
      return element?.tagName.toLowerCase() === "button" && element?.textContent?.trim() === "25";
    } });

    fireEvent.click(day25Button);

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0];
    expect([emitted.getFullYear(), emitted.getMonth(), emitted.getDate()]).toEqual([2026, 9, 25]);

    await waitFor(() => {
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });
  });

  it.each([
    { min: 1900, max: 2100, custom: false },
    { min: 2020, max: 2030, custom: true },
  ])("preserves_default_and_custom_year_bounds %s", ({ min, max, custom }) => {
    const onChange = vi.fn();
    const controlledDate = new Date(2026, 9, 24);

    render(
      <DatePicker
        value={controlledDate}
        onChange={onChange}
        {...(custom ? { fromYear: min, toYear: max } : {})}
      />
    );

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    const yearSelect = document.querySelector("select.rdp-years_dropdown") as HTMLSelectElement;
    expect(yearSelect).not.toBeNull();

    const optionYears = Array.from(yearSelect.options).map((opt) => Number(opt.value));
    expect(optionYears).toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));

    // Navigate to first year, January (0)
    fireEvent.change(yearSelect, { target: { value: String(min) } });
    const monthSelect = document.querySelector("select.rdp-months_dropdown") as HTMLSelectElement;
    fireEvent.change(monthSelect, { target: { value: "0" } });

    const prevButton = document.querySelector(".rdp-button_previous") as HTMLButtonElement;
    const isPrevDisabled = prevButton.getAttribute("aria-disabled") === "true" || prevButton.disabled;
    expect(isPrevDisabled).toBe(true);

    // Navigate to last year, December (11)
    fireEvent.change(yearSelect, { target: { value: String(max) } });
    fireEvent.change(monthSelect, { target: { value: "11" } });

    const nextButton = document.querySelector(".rdp-button_next") as HTMLButtonElement;
    const isNextDisabled = nextButton.getAttribute("aria-disabled") === "true" || nextButton.disabled;
    expect(isNextDisabled).toBe(true);
  });

  it("required_selection_cannot_clear_and_disabled_closes_open_popover", async () => {
    const onChange = vi.fn();
    const controlledDate = new Date(2026, 9, 24);

    const { rerender } = render(
      <DatePicker
        value={controlledDate}
        onChange={onChange}
        required={true}
      />
    );

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    // Click current selected day (24)
    const day24Button = screen.getByRole("button", { name: (_content, element) => {
      return element?.tagName.toLowerCase() === "button" && element?.textContent?.trim() === "24";
    } });

    fireEvent.click(day24Button);
    expect(onChange).not.toHaveBeenCalledWith(undefined);

    // Now re-open or rerender open picker disabled
    fireEvent.click(screen.getByRole("button"));
    rerender(
      <DatePicker
        value={controlledDate}
        onChange={onChange}
        disabled={true}
      />
    );

    const disabledTrigger = screen.getByRole("button");
    expect(disabledTrigger).toBeDisabled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();

    const callsBeforeDisabledClick = onChange.mock.calls.length;
    fireEvent.click(disabledTrigger);
    expect(onChange).toHaveBeenCalledTimes(callsBeforeDisabledClick);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });
});
