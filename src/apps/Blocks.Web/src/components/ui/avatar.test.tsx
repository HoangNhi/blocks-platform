import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback } from "./avatar";
import { useAvatarUrl } from "@/features/file/hooks/useAvatarUrl";

vi.mock("@/features/file/hooks/useAvatarUrl", () => ({
  useAvatarUrl: vi.fn((src?: string) => {
    if (!src) return undefined;
    if (src.startsWith("System/Avatar/")) return "blob:resolved-avatar-blob";
    return src;
  }),
}));

describe("Avatar component", () => {
  it("renders_blob_avatar_via_use_avatar_url", () => {
    render(
      <Avatar>
        <AvatarImage
          src="System/Avatar/11111111-1111-1111-1111-111111111111.png"
          alt="User Avatar"
        />
        <AvatarFallback>UA</AvatarFallback>
      </Avatar>
    );

    expect(useAvatarUrl).toHaveBeenCalledWith(
      "System/Avatar/11111111-1111-1111-1111-111111111111.png"
    );
  });
});
