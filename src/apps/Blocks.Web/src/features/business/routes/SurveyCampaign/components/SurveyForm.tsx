import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ChevronRight,
  ListChecks,
  MessageSquare,
  Loader2,
  GraduationCap,
  User,
  Briefcase,
  BookOpen,
} from "lucide-react";
import type { SurveyView } from "../../../types/survey-campaign.types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SurveyFormProps {
  campaign: SurveyView;
  initialScores?: Record<string, number>;
  initialTextAnswers?: Record<string, string>;
  isSubmitting?: boolean;
  onSubmit: (
    scores: Record<string, number>,
    textAnswers: Record<string, string>,
  ) => void;
  isPreview?: boolean;
}

const DEFAULT_EMPTY_OBJECT = {};

// Helper to get stakeholder info
const getStakeholderInfo = (type: number) => {
  switch (type) {
    case 1:
      return { icon: GraduationCap, label: "Sinh viên" };
    case 2:
      return { icon: User, label: "Cựu sinh viên" };
    case 3:
      return { icon: Briefcase, label: "Nhà tuyển dụng" };
    case 4:
      return { icon: BookOpen, label: "Giảng viên" };
    default:
      return { icon: User, label: "Khác" };
  }
};

export const SurveyForm = ({
  campaign,
  initialScores = DEFAULT_EMPTY_OBJECT,
  initialTextAnswers = DEFAULT_EMPTY_OBJECT,
  isSubmitting = false,
  onSubmit,
  isPreview = false,
}: SurveyFormProps) => {
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [textAnswers, setTextAnswers] =
    useState<Record<string, string>>(initialTextAnswers);

  // Update local state when initial props change (e.g. data loaded)
  useEffect(() => {
    setScores(initialScores);
  }, [initialScores]);

  useEffect(() => {
    setTextAnswers(initialTextAnswers);
  }, [initialTextAnswers]);

  const totalTopics = campaign.ListTopic?.length || 0;
  const currentTopic = campaign.ListTopic?.[currentTopicIndex];

  // If no topics, show empty state or return null
  if (!currentTopic) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardContent className="text-center p-8 text-muted-foreground">
          Không có nội dung khảo sát để hiển thị.
        </CardContent>
      </Card>
    );
  }

  const progress =
    totalTopics > 0 ? ((currentTopicIndex + 1) / totalTopics) * 100 : 0;

  const handleScoreChange = (questionId: string, score: number) => {
    setScores((prev) => ({ ...prev, [questionId]: score }));
  };

  const handleTextAnswerChange = (questionId: string, answer: string) => {
    setTextAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const validateCurrentTopic = () => {
    if (!currentTopic) return false;

    // Check scale questions
    for (const cat of currentTopic.ListCategory) {
      for (const q of cat.ListQuestion) {
        if (!scores[q.Id]) {
          toast.warning("Vui lòng trả lời đầy đủ các câu hỏi đánh giá");
          return false;
        }
      }
    }

    // Check text questions
    if (currentTopic.HasTextQuestionPart && currentTopic.ListTextQuestion) {
      for (const q of currentTopic.ListTextQuestion) {
        if (q.IsRequired && !textAnswers[q.Id]?.trim()) {
          toast.warning("Vui lòng trả lời các câu hỏi bắt buộc");
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateCurrentTopic()) {
      setCurrentTopicIndex((p) => Math.min(totalTopics - 1, p + 1));
      const scrollContainer = document.querySelector(".overflow-y-auto");
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const handleSubmitClick = () => {
    if (validateCurrentTopic()) {
      onSubmit(scores, textAnswers);
    }
  };

  const stakeholder = getStakeholderInfo(campaign.StakeholderType);
  const StakeholderIcon = stakeholder.icon;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6 font-sans">
      {/* Progress Bar - Sticky */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-3 -mx-4 px-4">
        <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
          <span>Tiến độ khảo sát</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Intro Card - Only on First Page */}
      {currentTopicIndex === 0 && (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
          </div>

          <CardHeader className="relative pb-6">
            <div className="flex items-center gap-2 mb-3">
              <Badge
                variant="secondary"
                className="bg-white/20 text-white border-white/30 hover:bg-white/30"
              >
                Phần {currentTopicIndex + 1} / {totalTopics}
              </Badge>
            </div>

            <CardTitle className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
              {campaign.Name}
            </CardTitle>

            <CardDescription className="text-white/80 mt-4">
              <Badge
                variant="outline"
                className="bg-white/10 text-white border-white/20 gap-2 px-3 py-1.5 text-sm"
              >
                <StakeholderIcon className="w-4 h-4" />
                {stakeholder.label}
              </Badge>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Current Topic Card */}
      <Card
        key={currentTopic.Id || "temp-topic-id"}
        className="animate-in fade-in slide-in-from-right-8 duration-300"
      >
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/50 py-4">
          <div className="flex items-center gap-3">
            <Badge className="h-8 w-8 rounded-lg flex items-center justify-center text-sm">
              {currentTopicIndex + 1}
            </Badge>
            <CardTitle className="text-xl text-primary">
              {currentTopic.Title}
            </CardTitle>
          </div>
          <Badge variant="outline">
            Trang {currentTopicIndex + 1}/{totalTopics}
          </Badge>
        </CardHeader>

        <CardContent className="pt-6 space-y-8">
          {/* Part I: Scale Questions */}
          <div className="space-y-6">
            {currentTopic.ListCategory?.map((cat) => (
              <div key={cat.Id}>
                {cat.Name && (
                  <h4 className="font-bold text-foreground mb-4 bg-primary/5 p-3 rounded-lg border-l-4 border-primary">
                    {cat.Name}
                  </h4>
                )}
                <div className="space-y-6 pl-2">
                  {cat.ListQuestion?.map((q) => (
                    <div
                      key={q.Id}
                      className="space-y-3 pb-4 border-b border-border/50 last:border-0"
                    >
                      <Label className="text-foreground font-medium text-base">
                        {q.Content} <span className="text-destructive">*</span>
                      </Label>

                      {/* 1-5 Scale UI with styled buttons */}
                      <div className="flex flex-wrap gap-2 items-center justify-between sm:justify-start sm:gap-3">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleScoreChange(q.Id, val)}
                            className={cn(
                              "w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all duration-200",
                              scores[q.Id] === val
                                ? val === 1
                                  ? "border-destructive bg-destructive text-destructive-foreground scale-110"
                                  : val === 5
                                    ? "border-green-500 bg-green-500 text-white scale-110"
                                    : "border-primary bg-primary text-primary-foreground scale-110"
                                : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:bg-muted",
                            )}
                          >
                            {val}
                          </button>
                        ))}
                        <div className="hidden sm:flex text-xs text-muted-foreground gap-6 items-center ml-4">
                          <span className="italic">
                            (1: Hoàn toàn không đồng ý)
                          </span>
                          <span className="italic">(5: Hoàn toàn đồng ý)</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Part II: Open Ended / Text Questions */}
          {currentTopic.HasTextQuestionPart && (
            <>
              <Separator className="my-6" />
              <div className="space-y-5">
                <h4 className="font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2">
                  <MessageSquare size={20} />
                  {currentTopic.TextQuestionTitle || "Ý kiến bổ sung"}
                </h4>
                <div className="space-y-5">
                  {currentTopic.ListTextQuestion?.map((q) => (
                    <div key={q.Id} className="space-y-2">
                      <Label className="text-sm font-semibold">
                        {q.Content}{" "}
                        {q.IsRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </Label>
                      <textarea
                        rows={3}
                        value={textAnswers[q.Id] || ""}
                        onChange={(e) =>
                          handleTextAnswerChange(q.Id, e.target.value)
                        }
                        className="w-full border border-input rounded-lg p-3 text-sm bg-background focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition-shadow resize-none"
                        placeholder="Nhập câu trả lời của bạn..."
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center pt-6 pb-12">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCurrentTopicIndex((p) => Math.max(0, p - 1));
            const scrollContainer = document.querySelector(".overflow-y-auto");
            if (scrollContainer) {
              scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          disabled={currentTopicIndex === 0}
          className="flex items-center gap-2"
        >
          <ArrowLeft size={18} /> Quay lại
        </Button>

        {currentTopicIndex < totalTopics - 1 ? (
          <Button type="button" onClick={handleNext} className="gap-2">
            Tiếp theo <ChevronRight size={18} />
          </Button>
        ) : (
          <Button
            type="button"
            variant={isPreview ? "secondary" : "default"}
            className={cn(
              "gap-2",
              !isPreview && "bg-green-600 hover:bg-green-700 text-white",
            )}
            onClick={handleSubmitClick}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {isPreview ? "Hoàn thành (Xem trước)" : "Gửi Kết Quả"}{" "}
                <ListChecks size={18} />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

