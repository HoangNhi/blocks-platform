import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  TemplateTopic,
  TemplateTextQuestion,
} from "../types/survey-template.types";

export const useSurveyTopics = (initialTopics: TemplateTopic[] = []) => {
  const [listTopic, setListTopic] = useState<TemplateTopic[]>(initialTopics);
  const [collapsedTopics, setCollapsedTopics] = useState<
    Record<string, boolean>
  >({});

  // Topic Handlers
  const handleAddTopic = () => {
    const newTopic: TemplateTopic = {
      Id: uuidv4(),
      Title: "Chủ đề mới (VD: Cơ sở vật chất)",
      Sort: listTopic.length + 1,
      ListCategory: [],
      HasTextQuestionPart: true,
      TextQuestionTitle: "Ý kiến khác",
      ListTextQuestion: [],
      IsActived: true,
      IsEdit: false,
      FolderUpload: "",
    };
    setListTopic((prev) => [...prev, newTopic]);
  };

  const toggleTopicCollapse = (id: string) => {
    setCollapsedTopics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteTopic = (id: string) => {
    setListTopic((prev) => prev.filter((t) => t.Id !== id));
  };

  // Category Handlers
  const handleAddCategory = (topicId: string) => {
    setListTopic((prev) =>
      prev.map((t) => {
        if (t.Id !== topicId) return t;
        return {
          ...t,
          ListCategory: [
            ...t.ListCategory,
            {
              Id: uuidv4(),
              TopicId: topicId,
              Name: "Nhóm tiêu chí mới (VD: 1. Nội dung môn học)",
              Sort: t.ListCategory.length + 1,
              ListQuestion: [],
              IsActived: true,
              IsEdit: false,
              FolderUpload: "",
            },
          ],
        };
      }),
    );
  };

  const handleDeleteCategory = (topicId: string, catId: string) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListCategory: t.ListCategory.filter((c) => c.Id !== catId),
            }
          : t,
      ),
    );
  };

  // Scale Question Handlers
  const handleAddScaleQuestion = (topicId: string, catId: string) => {
    setListTopic((prev) =>
      prev.map((t) => {
        if (t.Id !== topicId) return t;
        return {
          ...t,
          ListCategory: t.ListCategory.map((c) => {
            if (c.Id !== catId) return c;
            return {
              ...c,
              ListQuestion: [
                ...c.ListQuestion,
                {
                  Id: uuidv4(),
                  CategoryId: catId,
                  Content: "",
                  Sort: c.ListQuestion.length + 1,
                  IsActived: true,
                  IsEdit: false,
                  FolderUpload: "",
                },
              ],
            };
          }),
        };
      }),
    );
  };

  const handleDeleteQuestion = (
    topicId: string,
    catId: string,
    qId: string,
  ) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListCategory: t.ListCategory.map((c) =>
                c.Id === catId
                  ? {
                      ...c,
                      ListQuestion: c.ListQuestion.filter((q) => q.Id !== qId),
                    }
                  : c,
              ),
            }
          : t,
      ),
    );
  };

  // Open Ended (Text) Question Handlers
  const handleAddTextQuestion = (topicId: string) => {
    setListTopic((prev) =>
      prev.map((t) => {
        if (t.Id !== topicId) return t;
        return {
          ...t,
          ListTextQuestion: [
            ...t.ListTextQuestion,
            {
              Id: uuidv4(),
              TopicId: topicId,
              Content: "",
              Sort: t.ListTextQuestion.length + 1,
              IsRequired: false,
              IsActived: true,
              IsEdit: false,
              FolderUpload: "",
            },
          ],
        };
      }),
    );
  };

  const handleDeleteTextQuestion = (topicId: string, qId: string) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListTextQuestion: t.ListTextQuestion.filter((q) => q.Id !== qId),
            }
          : t,
      ),
    );
  };

  // Helper Handlers
  const updateTopic = <K extends keyof TemplateTopic>(
    id: string,
    field: K,
    value: TemplateTopic[K],
  ) => {
    setListTopic((prev) =>
      prev.map((t) => (t.Id === id ? { ...t, [field]: value } : t)),
    );
  };

  const updateCategory = (topicId: string, catId: string, val: string) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListCategory: t.ListCategory.map((c) =>
                c.Id === catId ? { ...c, Name: val } : c,
              ),
            }
          : t,
      ),
    );
  };

  const updateScaleQuestion = (
    topicId: string,
    catId: string,
    qId: string,
    val: string,
  ) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListCategory: t.ListCategory.map((c) =>
                c.Id === catId
                  ? {
                      ...c,
                      ListQuestion: c.ListQuestion.map((q) =>
                        q.Id === qId ? { ...q, Content: val } : q,
                      ),
                    }
                  : c,
              ),
            }
          : t,
      ),
    );
  };

  const updateTextQuestion = <K extends keyof TemplateTextQuestion>(
    topicId: string,
    qId: string,
    field: K,
    val: TemplateTextQuestion[K],
  ) => {
    setListTopic((prev) =>
      prev.map((t) =>
        t.Id === topicId
          ? {
              ...t,
              ListTextQuestion: t.ListTextQuestion.map((q) =>
                q.Id === qId ? { ...q, [field]: val } : q,
              ),
            }
          : t,
      ),
    );
  };

  return {
    listTopic,
    setListTopic,
    collapsedTopics,
    handlers: {
      handleAddTopic,
      toggleTopicCollapse,
      handleDeleteTopic,
      handleAddCategory,
      handleDeleteCategory,
      handleAddScaleQuestion,
      handleDeleteQuestion,
      handleAddTextQuestion,
      handleDeleteTextQuestion,
      updateTopic,
      updateCategory,
      updateScaleQuestion,
      updateTextQuestion,
    },
  };
};
