import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_TAG_MIME,
  EvidenceTag,
  decodeEvidenceTagTransfer,
  encodeEvidenceTagTransfer,
} from "./extensions/EvidenceTag";

describe("EvidenceTag", () => {
  it("serializes and deserializes the custom drag payload", () => {
    expect(EVIDENCE_TAG_MIME).toBe("application/x-aun-evidence");

    const payload = encodeEvidenceTagTransfer({
      evidenceId: "e-1",
      evidenceCode: "HS-01",
      evidenceName: "Hồ sơ minh chứng",
    });

    expect(decodeEvidenceTagTransfer(payload)).toEqual({
      evidenceId: "e-1",
      evidenceCode: "HS-01",
      evidenceName: "Hồ sơ minh chứng",
    });
  });

  it("parses and renders evidence tags as inline atoms", () => {
    const editor = new Editor({
      extensions: [StarterKit, EvidenceTag],
    });

    editor.commands.setContent(
      '<p><span data-evidence-id="e-1" data-evidence-code="HS-01" data-evidence-name="Hồ sơ minh chứng">[HS-01]</span></p>',
    );

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "evidenceTag",
              attrs: {
                evidenceId: "e-1",
                evidenceCode: "HS-01",
                evidenceName: "Hồ sơ minh chứng",
              },
            },
          ],
        },
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain('data-evidence-id="e-1"');
    expect(html).toContain('data-evidence-code="HS-01"');
    expect(html).toContain("[HS-01]");

    editor.destroy();
  });
});
