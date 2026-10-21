import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UploadFile from "./upload-file";

vi.mock("./file-viewer-dialog", () => ({
  default: () => null,
}));

describe("UploadFile filename display", () => {
  it("keeps full filename in title for uploaded and selected files", () => {
    const uploadedName =
      "very-very-long-uploaded-file-name-that-should-be-truncated-in-the-row-layout.pdf";
    const selectedName =
      "very-very-long-selected-file-name-that-should-be-truncated-in-the-row-layout.pdf";

    const { container } = render(
      <UploadFile
        listAttachment={
          [
            {
              Id: "1",
              FullFileName: uploadedName,
              FileUrl: "/files/1",
            },
          ] as any
        }
      />,
    );

    expect(screen.getByText(uploadedName)).toHaveAttribute("title", uploadedName);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["file-data"], selectedName, { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText(selectedName)).toHaveAttribute("title", selectedName);
  });
});
