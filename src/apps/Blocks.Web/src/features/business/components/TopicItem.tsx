import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trash2,
  ChevronRight,
  ChevronDown,
  ListChecks,
  Plus,
  MessageSquare,
} from "lucide-react";
import type {
  TemplateTopic,
  TemplateTextQuestion,
} from "../types/survey-template.types";
import { CategoryItem } from "./CategoryItem";
import { TextQuestionItem } from "./TextQuestionItem";

interface TopicItemProps {
  topic: TemplateTopic;
  index: number;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onUpdateTopic: <K extends keyof TemplateTopic>(
    id: string,
    field: K,
    value: TemplateTopic[K],
  ) => void;
  onAddCategory: (topicId: string) => void;
  onUpdateCategory: (topicId: string, catId: string, value: string) => void;
  onDeleteCategory: (topicId: string, catId: string) => void;
  onAddQuestion: (topicId: string, catId: string) => void;
  onUpdateQuestion: (
    topicId: string,
    catId: string,
    qId: string,
    value: string,
  ) => void;
  onDeleteQuestion: (topicId: string, catId: string, qId: string) => void;
  onAddTextQuestion: (topicId: string) => void;
  onUpdateTextQuestion: <K extends keyof TemplateTextQuestion>(
    topicId: string,
    qId: string,
    field: K,
    value: TemplateTextQuestion[K],
  ) => void;
  onDeleteTextQuestion: (topicId: string, qId: string) => void;
}

export const TopicItem = ({
  topic,
  index,
  isCollapsed,
  onToggleCollapse,
  onDeleteTopic,
  onUpdateTopic,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onAddTextQuestion,
  onUpdateTextQuestion,
  onDeleteTextQuestion,
}: TopicItemProps) => {
  return (
    <Card className="overflow-hidden border-gray-200 shadow-sm p-0 gap-0">
      {/* Topic Header */}
      <div className="p-4 bg-blue-50/50 border-b border-gray-100 flex flex-row items-center justify-between space-y-0 text-sm group/header transition-colors hover:bg-blue-50">
        <div className="flex items-center gap-3 flex-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onToggleCollapse(topic.Id)}
            className="text-blue-600 hover:bg-blue-100 hover:text-blue-700 h-8 w-8 shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </Button>
          <div className="flex-1 mr-4">
            <Label className="text-xs font-bold text-blue-600 uppercase mb-1 block cursor-pointer">
              Chủ đề {index + 1}
            </Label>
            <Input
              type="text"
              value={topic.Title}
              onChange={(e) => onUpdateTopic(topic.Id, "Title", e.target.value)}
              className="w-full font-bold text-gray-800 bg-transparent border border-transparent hover:border-blue-200 hover:bg-white focus:bg-white focus:border-blue-500 px-2 py-1 h-auto text-lg rounded transition-all placeholder:text-gray-400"
              placeholder="Nhập tên chủ đề (VD: Giảng viên)"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDeleteTopic(topic.Id)}
          className="text-gray-400 hover:text-destructive hover:bg-red-50"
        >
          <Trash2 size={18} />
        </Button>
      </div>

      {/* Topic Body */}
      {!isCollapsed && (
        <CardContent className="p-6 space-y-8">
          {/* --- PART 1: CATEGORIES & SCALE QUESTIONS --- */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 pb-2 border-b border-gray-100">
              <ListChecks size={18} className="text-blue-600" />
              PHẦN I: CÂU HỎI ĐÁNH GIÁ (1 - 5)
            </div>

            {topic.ListCategory.map((cat, cIndex) => (
              <CategoryItem
                key={cat.Id}
                category={cat}
                index={cIndex}
                topicId={topic.Id}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={onDeleteCategory}
                onAddQuestion={onAddQuestion}
                onUpdateQuestion={onUpdateQuestion}
                onDeleteQuestion={onDeleteQuestion}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => onAddCategory(topic.Id)}
              className="w-full border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Plus size={16} className="mr-2" /> Thêm Nhóm Câu Hỏi Mới
            </Button>
          </div>

          {/* --- PART 2: TEXT QUESTIONS --- */}
          <div className="pt-6 border-t border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <MessageSquare size={18} className="text-orange-500" />
                PHẦN II: CÂU HỎI MỞ (TEXT)
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`has-text-${topic.Id}`}
                  className="text-xs text-gray-500 cursor-pointer"
                >
                  Kích hoạt phần này?
                </Label>
                <Checkbox
                  id={`has-text-${topic.Id}`}
                  checked={topic.HasTextQuestionPart}
                  onCheckedChange={(checked) =>
                    onUpdateTopic(
                      topic.Id,
                      "HasTextQuestionPart",
                      checked === true,
                    )
                  }
                  className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
              </div>
            </div>

            {topic.HasTextQuestionPart && (
              <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100 space-y-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-semibold text-orange-600 uppercase">
                    Tiêu đề phần Text
                  </Label>
                  <Input
                    type="text"
                    value={topic.TextQuestionTitle || ""}
                    onChange={(e) =>
                      onUpdateTopic(
                        topic.Id,
                        "TextQuestionTitle",
                        e.target.value,
                      )
                    }
                    className="w-full font-semibold text-gray-700 bg-white focus-visible:ring-orange-400"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-gray-500 uppercase">
                    Danh sách câu hỏi mở
                  </Label>
                  {topic.ListTextQuestion.map((q, idx) => (
                    <TextQuestionItem
                      key={q.Id}
                      question={q}
                      index={idx}
                      onUpdate={(id, field, value) =>
                        onUpdateTextQuestion(topic.Id, id, field, value)
                      }
                      onDelete={(id) => onDeleteTextQuestion(topic.Id, id)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onAddTextQuestion(topic.Id)}
                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 text-xs h-8"
                  >
                    <Plus size={14} className="mr-1" /> Thêm câu hỏi Text
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

