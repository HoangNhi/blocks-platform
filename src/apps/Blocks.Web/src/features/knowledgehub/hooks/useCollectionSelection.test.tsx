import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import {
  parseSelection,
  useCollectionSelection,
} from "./useCollectionSelection";

const ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const THIRD_ID = "33333333-3333-3333-3333-333333333333";

function Probe() {
  const { selection, select, clearIfSelected, getCurrent } =
    useCollectionSelection();
  const location = useLocation();
  return (
    <div>
      <p data-testid="state">{selection.state}</p>
      <p data-testid="selected-id">
        {selection.state === "selected" ? selection.id : ""}
      </p>
      <p data-testid="url">{location.search}</p>
      <button onClick={() => select(ID)}>Chọn</button>
      <button onClick={() => select("INVALID-UUID")}>Chọn không hợp lệ</button>
      <button onClick={() => clearIfSelected(ID)}>Xóa đã chọn</button>
      <button onClick={() => clearIfSelected(OTHER_ID)}>Xóa ID khác</button>
      <button
        data-testid="get-current-btn"
        onClick={() => {
          const current = getCurrent();
          const target = document.getElementById("current-probe");
          if (target) target.textContent = current.state;
        }}
      >
        Lấy hiện tại
      </button>
      <span id="current-probe" />
    </div>
  );
}

function HistoryProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  const { select, clearIfSelected } = useCollectionSelection();
  return (
    <div>
      <output data-testid="history-url">{location.search}</output>
      <button onClick={() => select(ID)}>Chọn A</button>
      <button onClick={() => select(OTHER_ID)}>Chọn B</button>
      <button onClick={() => select(THIRD_ID)}>Chọn C</button>
      <button onClick={() => clearIfSelected(OTHER_ID)}>Xóa B</button>
      <button onClick={() => navigate(-1)}>Quay lại</button>
      <button onClick={() => navigate(1)}>Tiến tới</button>
    </div>
  );
}

describe("URL-only collection selection", () => {
  it("rejects absent-vs-invalid, repeated, empty and zero c", () => {
    expect(parseSelection(new URLSearchParams()).state).toBe("none");
    expect(parseSelection(new URLSearchParams("c=")).state).toBe("invalid");
    expect(parseSelection(new URLSearchParams("c=x&c=y")).state).toBe(
      "invalid"
    );
    expect(
      parseSelection(
        new URLSearchParams("c=00000000-0000-0000-0000-000000000000")
      ).state
    ).toBe("invalid");
  });

  it("parses valid UUID and normalizes to lowercase", () => {
    const uppercaseId = ID.toUpperCase();
    const result = parseSelection(new URLSearchParams(`c=${uppercaseId}`));
    expect(result).toEqual({
      state: "selected",
      id: ID.toLowerCase(),
    });
  });

  it("preserves unrelated query parameters", () => {
    render(
      <MemoryRouter initialEntries={["/knowledgehub?view=compact"]}>
        <Probe />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Chọn" }));
    expect(screen.getByTestId("url").textContent).toContain("view=compact");
    expect(screen.getByTestId("url").textContent).toContain("c=" + ID);

    fireEvent.click(screen.getByRole("button", { name: "Xóa đã chọn" }));
    expect(screen.getByTestId("url").textContent).toBe("?view=compact");
  });

  it("does not clear if deletedId does not match current selection", () => {
    render(
      <MemoryRouter initialEntries={[`/knowledgehub?c=${ID}`]}>
        <Probe />
      </MemoryRouter>
    );
    expect(screen.getByTestId("selected-id").textContent).toBe(ID);

    fireEvent.click(screen.getByRole("button", { name: "Xóa ID khác" }));
    expect(screen.getByTestId("selected-id").textContent).toBe(ID);
    expect(screen.getByTestId("url").textContent).toBe(`?c=${ID}`);
  });

  it("ignores select when given invalid UUID", () => {
    render(
      <MemoryRouter initialEntries={["/knowledgehub"]}>
        <Probe />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Chọn không hợp lệ" })
    );
    expect(screen.getByTestId("url").textContent).toBe("");
    expect(screen.getByTestId("state").textContent).toBe("none");
  });

  it("ignores select and clear when not on /knowledgehub pathname", () => {
    render(
      <MemoryRouter initialEntries={[`/other-path?c=${ID}`]}>
        <Probe />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Chọn" }));
    expect(screen.getByTestId("url").textContent).toBe(`?c=${ID}`);

    fireEvent.click(screen.getByRole("button", { name: "Xóa đã chọn" }));
    expect(screen.getByTestId("url").textContent).toBe(`?c=${ID}`);
  });

  it("provides getCurrent imperative reader", () => {
    render(
      <MemoryRouter initialEntries={[`/knowledgehub?c=${ID}`]}>
        <Probe />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("get-current-btn"));
    expect(document.getElementById("current-probe")?.textContent).toBe(
      "selected"
    );
  });

  it("uses push for selection so Back/Forward restore A and B", async () => {
    render(
      <MemoryRouter initialEntries={["/knowledgehub?foo=1"]}>
        <HistoryProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn A" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn B" }));
    expect(screen.getByTestId("history-url")).toHaveTextContent(`c=${OTHER_ID}`);

    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    await waitFor(() =>
      expect(screen.getByTestId("history-url")).toHaveTextContent(`c=${ID}`)
    );

    fireEvent.click(screen.getByRole("button", { name: "Tiến tới" }));
    await waitFor(() =>
      expect(screen.getByTestId("history-url")).toHaveTextContent(`c=${OTHER_ID}`)
    );
  });

  it("uses replace for deleting B while preserving unrelated query parameters", async () => {
    render(
      <MemoryRouter initialEntries={[`/knowledgehub?foo=1&c=${OTHER_ID}`]}>
        <HistoryProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Xóa B" }));
    await waitFor(() =>
      expect(screen.getByTestId("history-url")).toHaveTextContent("?foo=1")
    );

    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    await waitFor(() =>
      expect(screen.getByTestId("history-url")).toHaveTextContent("?foo=1")
    );
  });
});
