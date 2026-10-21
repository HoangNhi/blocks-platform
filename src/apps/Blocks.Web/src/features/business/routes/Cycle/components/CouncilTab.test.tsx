import * as React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CouncilTab } from "./CouncilTab";
import type { Council } from "@/features/business/types/cycle.types";

function mockRect(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 120,
    top: 120,
    left: 100,
    bottom: 160,
    right: 420,
    width: 320,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect);
}

const standards = [
  {
    Id: "standard-1",
    StandardSetId: "set-1",
    Code: "TC 1",
    Name: "Tieu chuan 1",
    Order: 1,
  },
  {
    Id: "standard-2",
    StandardSetId: "set-1",
    Code: "TC 2",
    Name: "Tieu chuan 2",
    Order: 2,
  },
];

const userOptions = [
  { Value: "user-1", Text: "Nguoi dung 1" },
  { Value: "user-2", Text: "Nguoi dung 2" },
];

function createCouncil(): Council {
  return {
    Id: "council-1",
    CycleId: "cycle-1",
    UserId: "user-1",
    RoleId: 4,
    AssignedStandardIds: [],
    IsActived: true,
    IsEdit: false,
    FolderUpload: "",
  };
}

function TestHost() {
  const [listCouncil, setListCouncil] = React.useState<Council[]>([
    createCouncil(),
  ]);

  const handleChange = React.useCallback(
    (
      id: string,
      field: keyof Council,
      value: string | number | boolean | string[],
    ) => {
      setListCouncil((prev) =>
        prev.map((member) =>
          member.Id === id ? { ...member, [field]: value } : member,
        ),
      );
    },
    [],
  );

  return (
    <CouncilTab
      listCouncil={listCouncil}
      standards={standards}
      userOptions={userOptions}
      errors={{}}
      d15={{
        totalMembers: 1,
        enoughMembers: false,
        evaluatorCounts: {},
        providerCounts: {},
        insufficientEval: [],
        uncoveredProvider: [],
      }}
      onAdd={() => {}}
      onDelete={() => {}}
      onChange={handleChange}
    />
  );
}

describe("CouncilTab", () => {
  it("keeps the standards multi-select open after parent state updates", async () => {
    const { container } = render(<TestHost />);

    const input = container.querySelector(
      "input[cmdk-input]",
    ) as HTMLInputElement | null;

    expect(input).toBeTruthy();

    const commandRoot = input?.closest("[data-slot='command']") as HTMLElement | null;
    expect(commandRoot).toBeTruthy();
    mockRect(commandRoot as HTMLElement);

    fireEvent.focus(input as HTMLInputElement);

    const scrollContainer = await screen.findByTestId(
      "multi-select-scroll-container",
    );
    fireEvent.mouseDown(within(scrollContainer).getByText("TC 1"));

    await waitFor(() => {
      const openScrollContainer = screen.getByTestId(
        "multi-select-scroll-container",
      );
      expect(within(openScrollContainer).getByText("TC 2")).toBeInTheDocument();
    });
  });
});
