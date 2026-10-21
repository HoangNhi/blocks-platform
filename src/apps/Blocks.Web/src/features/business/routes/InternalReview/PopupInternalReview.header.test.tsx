import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PopupInternalReviewHeaderMeta,
  PopupInternalReviewHeaderTitle,
  normalizeEvaluationPurpose,
} from "./PopupInternalReview";

describe("normalizeEvaluationPurpose", () => {
  it.each([undefined, null, "", "   "])("returns null for %s", (value) => {
    expect(normalizeEvaluationPurpose(value)).toBeNull();
  });

  it("returns trimmed text when purpose has content", () => {
    expect(normalizeEvaluationPurpose("  QA self-assessment  ")).toBe("QA self-assessment");
  });
});

describe("PopupInternalReviewHeaderMeta", () => {
  it("applies truncation class to the header title for single-line behavior", () => {
    render(
      <PopupInternalReviewHeaderTitle title="A very long internal review cycle title that should truncate on narrow widths" />,
    );

    const title = screen.getByText(/A very long internal review cycle title/);
    expect(title).toHaveClass("truncate", "text-lg", "font-semibold", "text-slate-900");
  });

  it("uses the merged metadata row structure and classes", () => {
    const { container } = render(
      <PopupInternalReviewHeaderMeta
        statusLabel="Submitted"
        statusBadgeClass="bg-blue-100 text-blue-700"
        reviewRound={2}
        evaluationPurpose="Program-level review"
      />,
    );

    const row = container.firstElementChild;
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass(
      "mt-1.5",
      "flex",
      "items-center",
      "gap-2",
      "text-sm",
      "min-w-0",
      "flex-nowrap",
      "overflow-hidden",
    );
  });

  it.each([undefined, null, "", "   "])(
    "does not render separator/purpose when evaluation purpose is %s",
    (evaluationPurpose) => {
      const { container } = render(
        <PopupInternalReviewHeaderMeta
          statusLabel="Submitted"
          statusBadgeClass="bg-blue-100 text-blue-700"
          reviewRound={1}
          evaluationPurpose={evaluationPurpose}
        />,
      );

      expect(
        container.querySelector('span[aria-hidden="true"].shrink-0.text-slate-300'),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".max-w-\\[320px\\]")).not.toBeInTheDocument();
    },
  );

  it("renders separator and trimmed purpose when text exists", () => {
    const { container } = render(
      <PopupInternalReviewHeaderMeta
        statusLabel="Submitted"
        statusBadgeClass="bg-blue-100 text-blue-700"
        reviewRound={1}
        evaluationPurpose="  Program-level review  "
      />,
    );

    expect(
      container.querySelector('span[aria-hidden="true"].shrink-0.text-slate-300'),
    ).toBeInTheDocument();
    const purposeText = screen.getByText("Program-level review");
    expect(purposeText).toBeInTheDocument();
    expect(purposeText).toHaveClass("truncate", "max-w-[320px]", "text-slate-500");
  });
});
