import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import type { TemplateTopic } from "../types/survey-template.types";
import {
  ensureSelectedTemplateOption,
  remapTemplateTopicIdsForCampaign,
} from "./surveyCampaignTemplate";

describe("surveyCampaignTemplate utils", () => {
  it("adds selected template option when missing from current options", () => {
    const options = [{ Value: "a", Text: "Template A" }];

    const next = ensureSelectedTemplateOption(options, "b", "Template B");

    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ Value: "b", Text: "Template B" });
  });

  it("remaps nested ids and removes source linkage metadata when cloning template topics for campaign", () => {
    const source: TemplateTopic[] = [
      {
        Id: uuidv4(),
        Title: "Topic 1",
        HasTextQuestionPart: true,
        TextQuestionTitle: "Other",
        Sort: 1,
        ListCategory: [
          {
            Id: uuidv4(),
            TopicId: uuidv4(),
            Name: "Category 1",
            Sort: 1,
            ListQuestion: [
              {
                Id: uuidv4(),
                CategoryId: uuidv4(),
                Content: "Q1",
                Sort: 1,
                IsActived: true,
                IsEdit: false,
                FolderUpload: "",
              },
            ],
            IsActived: true,
            IsEdit: false,
            FolderUpload: "",
          },
        ],
        ListTextQuestion: [
          {
            Id: uuidv4(),
            TopicId: uuidv4(),
            Content: "Text",
            Sort: 1,
            IsRequired: false,
            IsActived: true,
            IsEdit: false,
            FolderUpload: "",
          },
        ],
        IsActived: true,
        IsEdit: false,
        FolderUpload: "",
      },
    ];

    const remapped = remapTemplateTopicIdsForCampaign(source);

    expect(remapped).toHaveLength(1);
    expect(remapped[0].Id).not.toBe(source[0].Id);
    expect(remapped[0].ListCategory[0].Id).not.toBe(source[0].ListCategory[0].Id);
    expect(remapped[0].ListCategory[0].TopicId).toBe(remapped[0].Id);
    expect(remapped[0].ListCategory[0].ListQuestion[0].Id).not.toBe(
      source[0].ListCategory[0].ListQuestion[0].Id,
    );
    expect(remapped[0].ListCategory[0].ListQuestion[0].CategoryId).toBe(
      remapped[0].ListCategory[0].Id,
    );
    expect(remapped[0].ListTextQuestion[0].Id).not.toBe(
      source[0].ListTextQuestion[0].Id,
    );
    expect(remapped[0].ListTextQuestion[0].TopicId).toBe(remapped[0].Id);
  });
});
