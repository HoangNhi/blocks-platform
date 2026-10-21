import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import type { TemplateQuestion } from "../types/survey-template.types";

interface ScaleQuestionItemProps {
  question: TemplateQuestion;
  index: number;
  catIndex: number;
  onUpdate: (id: string, value: string) => void;
  onDelete: (id: string) => void;
}

export const ScaleQuestionItem = ({
  question,
  index,
  catIndex,
  onUpdate,
  onDelete,
}: ScaleQuestionItemProps) => {
  return (
    <div className="flex gap-2 items-start group/q">
      <span className="text-xs text-gray-400 mt-3 font-mono">
        {catIndex + 1}.{index + 1}
      </span>
      <Textarea
        rows={1}
        value={question.Content}
        onChange={(e) => onUpdate(question.Id, e.target.value)}
        className="flex-1 text-sm min-h-[40px] resize-none focus-visible:ring-blue-400"
        placeholder="Nội dung câu hỏi đánh giá..."
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(question.Id)}
        className="h-9 w-9 text-gray-300 hover:text-destructive opacity-0 group-hover/q:opacity-100"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
};
