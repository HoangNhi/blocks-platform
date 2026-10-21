import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type {
  TemplateTopic,
  TemplateTextQuestion,
} from "../types/survey-template.types";
import { TopicItem } from "./TopicItem";

interface TopicListEditorProps {
  listTopic: TemplateTopic[];
  collapsedTopics: Record<string, boolean>;
  handlers: {
    handleAddTopic: () => void;
    toggleTopicCollapse: (id: string) => void;
    handleDeleteTopic: (id: string) => void;
    handleAddCategory: (topicId: string) => void;
    handleDeleteCategory: (topicId: string, catId: string) => void;
    handleAddScaleQuestion: (topicId: string, catId: string) => void;
    handleDeleteQuestion: (topicId: string, catId: string, qId: string) => void;
    handleAddTextQuestion: (topicId: string) => void;
    handleDeleteTextQuestion: (topicId: string, qId: string) => void;
    updateTopic: <K extends keyof TemplateTopic>(
      id: string,
      field: K,
      value: TemplateTopic[K],
    ) => void;
    updateCategory: (topicId: string, catId: string, val: string) => void;
    updateScaleQuestion: (
      topicId: string,
      catId: string,
      qId: string,
      val: string,
    ) => void;
    updateTextQuestion: <K extends keyof TemplateTextQuestion>(
      topicId: string,
      qId: string,
      field: K,
      val: TemplateTextQuestion[K],
    ) => void;
  };
}

export const TopicListEditor = ({
  listTopic,
  collapsedTopics,
  handlers,
}: TopicListEditorProps) => {
  return (
    <div className="space-y-6">
      {listTopic.map((topic, tIndex) => (
        <TopicItem
          key={topic.Id}
          topic={topic}
          index={tIndex}
          isCollapsed={!!collapsedTopics[topic.Id]}
          onToggleCollapse={handlers.toggleTopicCollapse}
          onDeleteTopic={handlers.handleDeleteTopic}
          onUpdateTopic={handlers.updateTopic}
          onAddCategory={handlers.handleAddCategory}
          onUpdateCategory={handlers.updateCategory}
          onDeleteCategory={handlers.handleDeleteCategory}
          onAddQuestion={handlers.handleAddScaleQuestion}
          onUpdateQuestion={handlers.updateScaleQuestion}
          onDeleteQuestion={handlers.handleDeleteQuestion}
          onAddTextQuestion={handlers.handleAddTextQuestion}
          onUpdateTextQuestion={handlers.updateTextQuestion}
          onDeleteTextQuestion={handlers.handleDeleteTextQuestion}
        />
      ))}
      <Button
        type="button"
        onClick={handlers.handleAddTopic}
        variant="outline"
        className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 font-semibold"
      >
        <Plus size={20} className="mr-2" /> Thêm chủ đề mới
      </Button>
    </div>
  );
};
