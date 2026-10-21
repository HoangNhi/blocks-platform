import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditAccountDialog } from "./EditAccountDialog";
import type { ExternalReviewAccount } from "@/features/business/types/externalReview.types";

const account: ExternalReviewAccount = {
  Id: "account-1",
  ExternalReviewId: "review-1",
  UserId: "user-1",
  Fullname: "Chuyên gia PDCA",
  Username: "pdca-expert",
  Email: "pdca@example.com",
  IsActived: true,
  CreatedAt: "2026-04-12T00:00:00.000Z",
  CreatedBy: "tester",
};

describe("EditAccountDialog", () => {
  it("hiển thị ô mật khẩu và gửi kèm mật khẩu khi lưu", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditAccountDialog
        open
        account={account}
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit as never}
      />,
    );

    const passwordInput = screen.getByLabelText("Mật khẩu");
    fireEvent.change(passwordInput, { target: { value: "new-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-1",
        password: "new-secret",
      }),
    );
  });
});
