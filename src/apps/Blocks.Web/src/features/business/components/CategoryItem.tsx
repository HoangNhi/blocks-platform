import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, GripVertical, Plus } from "lucide-react";
import type { TemplateCategory } from "../types/survey-template.types";
import { ScaleQuestionItem } from "./ScaleQuestionItem";

interface CategoryItemProps {
  category: TemplateCategory;
  index: number;
  topicId: string;
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
}

export const CategoryItem = ({
  category,
  index,
  topicId,
  onUpdateCategory,
  onDeleteCategory,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
}: CategoryItemProps) => {
  return (
    <div className="pl-4 border-l-2 border-gray-200 space-y-4">
      {/* Category Header */}
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-gray-300 cursor-move" />
        <Input
          value={category.Name}
          onChange={(e) =>
            onUpdateCategory(topicId, category.Id, e.target.value)
          }
          className="font-semibold text-gray-700 bg-gray-50 flex-1 focus-visible:ring-blue-400"
          placeholder="Nhập tên nhóm tiêu chí (VD: 1. Đề cương...)"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDeleteCategory(topicId, category.Id)}
          className="text-gray-400 hover:text-destructive h-8 w-8"
        >
          <Trash2 size={16} />
        </Button>
      </div>

      {/* Questions List */}
      <div className="pl-6 space-y-2">
        {category.ListQuestion.map((q, qIndex) => (
          <ScaleQuestionItem
            key={q.Id}
            question={q}
            index={qIndex}
            catIndex={index}
            onUpdate={(qId, val) =>
              onUpdateQuestion(topicId, category.Id, qId, val)
            }
            onDelete={(qId) => onDeleteQuestion(topicId, category.Id, qId)}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAddQuestion(topicId, category.Id)}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium text-xs h-8"
        >
          <Plus size={14} className="mr-1" /> Thêm câu hỏi
        </Button>
      </div>
    </div>
  );
};
