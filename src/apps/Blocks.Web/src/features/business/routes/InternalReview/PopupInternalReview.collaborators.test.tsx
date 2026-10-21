import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CollaboratorState } from "@/features/business/hooks/useInternalReviewCollab";
import { PopupInternalReviewCollaborators } from "./PopupInternalReview";

function createCollaborator(
  clientId: number,
  overrides: Partial<Omit<CollaboratorState, "clientId">> = {},
): CollaboratorState {
  return {
    clientId,
    name: "Collaborator",
    initials: "C",
    color: "rgb(0, 0, 0)",
    ...overrides,
  };
}

describe("PopupInternalReviewCollaborators", () => {
  it("renders collaborator initials as plain avatar blocks with non-compress behavior", () => {
    render(
      <PopupInternalReviewCollaborators
        collaborators={[
          createCollaborator(1, {
            name: "Alice Brown",
            initials: "AB",
            color: "rgb(239, 68, 68)",
          }),
          createCollaborator(2, {
            name: "Bob Smith",
            initials: "BS",
            color: "rgb(59, 130, 246)",
          }),
        ]}
      />,
    );

    expect(screen.getByText("AB")).toHaveClass("shrink-0");
    expect(screen.getByText("BS")).toHaveClass("shrink-0");

    const aliceAvatar = screen.getByLabelText("Alice Brown");
    expect(aliceAvatar).toHaveClass("shrink-0");
    expect(aliceAvatar).toHaveTextContent("AB");

    const bobAvatar = screen.getByLabelText("Bob Smith");
    expect(bobAvatar).toHaveClass("shrink-0");
    expect(bobAvatar).toHaveTextContent("BS");
  });

  it("renders an overflow badge when more than four collaborators are present", () => {
    render(
      <PopupInternalReviewCollaborators
        collaborators={[
          createCollaborator(1, { name: "A One", initials: "A1" }),
          createCollaborator(2, { name: "B Two", initials: "B2" }),
          createCollaborator(3, { name: "C Three", initials: "C3" }),
          createCollaborator(4, { name: "D Four", initials: "D4" }),
          createCollaborator(5, { name: "E Five", initials: "E5" }),
          createCollaborator(6, { name: "F Six", initials: "F6" }),
        ]}
      />,
    );

    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("C3")).toBeInTheDocument();
    expect(screen.getByText("D4")).toBeInTheDocument();
    expect(screen.queryByText("E5")).not.toBeInTheDocument();
    expect(screen.queryByText("F6")).not.toBeInTheDocument();

    const overflowBadge = screen.getByText("+2");
    expect(overflowBadge).toHaveClass("shrink-0");
  });

  it("renders no avatar row content when there are no collaborators", () => {
    const { container } = render(<PopupInternalReviewCollaborators collaborators={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(/./)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});
