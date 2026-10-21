import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalPanelCard } from "./ApprovalPanelCard";

const PASS_TEXT = "\u0110\u1ea0T";
const FAIL_TEXT = "KH\u00d4NG \u0110\u1ea0T";

describe("ApprovalPanelCard", () => {
  it("shows approved final result to non-approver", () => {
    render(
      <ApprovalPanelCard
        framework="MOET"
        isApproved={true}
        canApprove={false}
        officialScore={null}
        officialResult={false}
        isApproving={false}
        officialCurrentState=""
        officialStrengths=""
        officialWeaknesses=""
        officialActionPlan=""
        onOfficialCurrentStateChange={vi.fn()}
        onOfficialStrengthsChange={vi.fn()}
        onOfficialWeaknessesChange={vi.fn()}
        onOfficialActionPlanChange={vi.fn()}
        onOfficialScoreChange={vi.fn()}
        onOfficialResultChange={vi.fn()}
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByText(FAIL_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /duyệt/i })).not.toBeInTheDocument();
  });

  it("shows editable controls for approver when item is pending", () => {
    render(
      <ApprovalPanelCard
        framework="AUN"
        isApproved={false}
        canApprove={true}
        officialScore={null}
        officialResult={null}
        isApproving={false}
        officialCurrentState=""
        officialStrengths=""
        officialWeaknesses=""
        officialActionPlan=""
        onOfficialCurrentStateChange={vi.fn()}
        onOfficialStrengthsChange={vi.fn()}
        onOfficialWeaknessesChange={vi.fn()}
        onOfficialActionPlanChange={vi.fn()}
        onOfficialScoreChange={vi.fn()}
        onOfficialResultChange={vi.fn()}
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /duyệt/i })).toBeInTheDocument();
    expect(screen.queryByText(PASS_TEXT)).not.toBeInTheDocument();
  });

  it("shows waiting message for non-approver when item is pending", () => {
    render(
      <ApprovalPanelCard
        framework="MOET"
        isApproved={false}
        canApprove={false}
        officialScore={null}
        officialResult={null}
        isApproving={false}
        officialCurrentState=""
        officialStrengths=""
        officialWeaknesses=""
        officialActionPlan=""
        onOfficialCurrentStateChange={vi.fn()}
        onOfficialStrengthsChange={vi.fn()}
        onOfficialWeaknessesChange={vi.fn()}
        onOfficialActionPlanChange={vi.fn()}
        onOfficialScoreChange={vi.fn()}
        onOfficialResultChange={vi.fn()}
        onApprove={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Đang chờ Chủ tịch/PCT chốt kết quả."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /duyệt/i })).not.toBeInTheDocument();
  });
});
