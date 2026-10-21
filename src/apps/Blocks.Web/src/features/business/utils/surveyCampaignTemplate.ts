import { v4 as uuidv4 } from "uuid";
import type { TemplateTopic } from "../types/survey-template.types";

type TemplateOption = { Value: string; Text: string };

export const ensureSelectedTemplateOption = (
  options: TemplateOption[],
  templateId?: string,
  templateTitle?: string,
): TemplateOption[] => {
  if (!templateId || !templateTitle) {
    return options;
  }

  if (options.some((x) => x.Value === templateId)) {
    return options;
  }

  return [...options, { Value: templateId, Text: templateTitle }];
};

export const remapTemplateTopicIdsForCampaign = (
  topics: TemplateTopic[],
): TemplateTopic[] => {
  return topics.map((topic) => {
    const nextTopicId = uuidv4();

    const nextCategories = topic.ListCategory.map((category) => {
      const nextCategoryId = uuidv4();

      return {
        Id: nextCategoryId,
        TopicId: nextTopicId,
        Name: category.Name,
        Sort: category.Sort,
        ListQuestion: category.ListQuestion.map((question) => ({
          Id: uuidv4(),
          CategoryId: nextCategoryId,
          Content: question.Content,
          Sort: question.Sort,
          IsActived: question.IsActived,
          IsEdit: question.IsEdit,
          FolderUpload: question.FolderUpload,
        })),
        IsActived: category.IsActived,
        IsEdit: category.IsEdit,
        FolderUpload: category.FolderUpload,
      };
    });

    return {
      Id: nextTopicId,
      Title: topic.Title,
      HasTextQuestionPart: topic.HasTextQuestionPart,
      TextQuestionTitle: topic.TextQuestionTitle,
      Sort: topic.Sort,
      ListCategory: nextCategories,
      ListTextQuestion: topic.ListTextQuestion.map((textQuestion) => ({
        Id: uuidv4(),
        TopicId: nextTopicId,
        Content: textQuestion.Content,
        Sort: textQuestion.Sort,
        IsRequired: textQuestion.IsRequired,
        IsActived: textQuestion.IsActived,
        IsEdit: textQuestion.IsEdit,
        FolderUpload: textQuestion.FolderUpload,
      })),
      IsActived: topic.IsActived,
      IsEdit: topic.IsEdit,
      FolderUpload: topic.FolderUpload,
    };
  });
};
