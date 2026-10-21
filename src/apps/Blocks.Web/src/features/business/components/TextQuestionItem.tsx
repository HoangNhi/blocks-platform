import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import type { TemplateTextQuestion } from "../types/survey-template.types";

interface TextQuestionItemProps {
  question: TemplateTextQuestion;
  index: number;
  onUpdate: <K extends keyof TemplateTextQuestion>(
    id: string,
    field: K,
    value: TemplateTextQuestion[K],
  ) => void;
  onDelete: (id: string) => void;
}

export const TextQuestionItem = ({
  question,
  index,
  onUpdate,
  onDelete,
}: TextQuestionItemProps) => {
  return (
    <div className="flex gap-2 items-start group/fb">
      <span className="text-xs text-gray-400 font-mono mt-3">{index + 1}.</span>
      <div className="flex-1 space-y-2">
        <Input
          value={question.Content}
          onChange={(e) => onUpdate(question.Id, "Content", e.target.value)}
          className="w-full text-sm focus-visible:ring-orange-400"
          placeholder="VD: Môn học nào không cần thiết?"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id={`req-${question.Id}`}
            checked={question.IsRequired}
            onCheckedChange={(checked) =>
              onUpdate(question.Id, "IsRequired", checked === true)
            }
            className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
          />
          <Label
            htmlFor={`req-${question.Id}`}
            className="text-xs text-gray-500 select-none cursor-pointer"
          >
            Bắt buộc
          </Label>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(question.Id)}
        className="h-9 w-9 text-gray-300 hover:text-destructive opacity-0 group-hover/fb:opacity-100"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
};
