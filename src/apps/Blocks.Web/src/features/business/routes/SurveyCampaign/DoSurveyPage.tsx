import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";
import type {
  SurveyView,
  SurveySubmissionRequest,
} from "../../types/survey-campaign.types";
import { toast } from "sonner";
import { surveyCampaignService } from "../../api/survey-campaign.api";
import { SurveyForm } from "./components/SurveyForm";

export const DoSurveyPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [campaign, setCampaign] = useState<SurveyView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initial Answers State (for pre-filling)
  const [initialScores, setInitialScores] = useState<Record<string, number>>(
    {},
  );
  const [initialTextAnswers, setInitialTextAnswers] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const fetchSurvey = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await surveyCampaignService.getSurveyByToken(token);
        if (res.Success && res.Data) {
          setCampaign(res.Data);

          // Pre-fill answers if any
          const newScores: Record<string, number> = {};
          const newTextAnswers: Record<string, string> = {};

          res.Data.ListTopic.forEach((topic) => {
            topic.ListCategory.forEach((cat) => {
              cat.ListQuestion.forEach((q) => {
                if (q.Score) newScores[q.Id] = q.Score;
              });
            });
            topic.ListTextQuestion.forEach((q) => {
              if (q.Answer) newTextAnswers[q.Id] = q.Answer;
            });
          });
          setInitialScores(newScores);
          setInitialTextAnswers(newTextAnswers);
        } else {
          setErrorMsg(res.Message || "Không thể tải bài khảo sát");
          toast.error(res.Message || "Không thể tải bài khảo sát");
        }
      } catch {
        setErrorMsg("Có lỗi xảy ra khi tải bài khảo sát");
        toast.error("Có lỗi xảy ra khi tải bài khảo sát");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSurvey();
  }, [token]);

  const handleSubmit = async (
    scores: Record<string, number>,
    textAnswers: Record<string, string>,
  ) => {
    if (!token) return;

    try {
      setIsSubmitting(true);
      const payload: SurveySubmissionRequest = {
        Token: token,
        Scores: Object.entries(scores).map(([k, v]) => ({
          QuestionId: k,
          Score: v,
        })),
        TextAnswers: Object.entries(textAnswers).map(([k, v]) => ({
          TextQuestionId: k,
          Content: v,
        })),
      };

      const res = await surveyCampaignService.submitSurvey(payload);
      if (res.Success) {
        setIsCompleted(true);
        toast.success("Gửi khảo sát thành công!");
      } else {
        toast.error(res.Message || "Gửi khảo sát thất bại");
      }
    } catch {
      toast.error("Có lỗi xảy ra khi gửi khảo sát");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-gray-600">Đang tải bài khảo sát...</p>
        </div>
      </div>
    );
  }

  if (errorMsg === "Chiến dịch chưa bắt đầu") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
            <Loader2 className="text-yellow-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            Chiến dịch chưa bắt đầu
          </h1>
          <p className="text-gray-600">
            Hiện tại chiến dịch khảo sát chưa được kích hoạt. <br />
            Vui lòng quay lại sau khi nhận được thông báo bắt đầu.
          </p>
        </div>
      </div>
    );
  }

  // Fallback for other errors (like invalid token)
  if (errorMsg) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center max-w-lg p-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ArrowLeft className="text-red-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Không thể truy cập khảo sát
          </h1>
          <p className="text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <ListChecks className="text-green-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            Cảm ơn bạn đã tham gia!
          </h1>
          <p className="text-gray-600">
            Câu trả lời của bạn đã được ghi nhận. Những đóng góp của bạn rất
            quan trọng đối với chúng tôi.
          </p>
        </div>
      </div>
    );
  }

  if (!campaign || !campaign.ListTopic || campaign.ListTopic.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center max-w-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Không tìm thấy khảo sát
          </h1>
          <p className="text-gray-600">
            Liên kết có thể không hợp lệ hoặc khảo sát đã kết thúc.
          </p>
        </div>
      </div>
    );
  }

  // Already Responded Screen
  if (campaign.IsSessionCompleted && !isEditing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="h-2 bg-blue-600 w-full" />

          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <ListChecks className="text-blue-600 w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-800">
                {campaign.Name}
              </h1>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium text-xs">
                <span className="w-2 h-2 rounded-full bg-green-600" />
                Đã hoàn thành
              </div>
            </div>

            <p className="text-gray-600 text-sm leading-relaxed">
              Cảm ơn bạn đã dành thời gian thực hiện khảo sát. <br />
              Câu trả lời của bạn đã được hệ thống ghi nhận.
            </p>

            <div className="pt-2">
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-bold px-8"
              >
                Xem lại & Chỉnh sửa
              </Button>
            </div>

            <p className="text-xs text-gray-400 pt-4">
              Nếu bạn muốn thay đổi câu trả lời, vui lòng nhấn nút chỉnh sửa ở
              trên.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <SurveyForm
          campaign={campaign}
          initialScores={initialScores}
          initialTextAnswers={initialTextAnswers}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};

