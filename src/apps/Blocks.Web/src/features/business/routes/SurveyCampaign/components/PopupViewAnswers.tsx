import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SurveyReadOnlyView } from "./SurveyReadOnlyView";
import { useEffect, useState } from "react";
import { surveyCampaignService } from "@/features/business/api/survey-campaign.api";
import type { SurveyView } from "@/features/business/types/survey-campaign.types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PopupViewAnswersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string;
  stakeholderName?: string;
}

export const PopupViewAnswers = ({
  open,
  onOpenChange,
  token,
  stakeholderName,
}: PopupViewAnswersProps) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SurveyView | null>(null);

  useEffect(() => {
    if (open && token) {
      const fetchData = async () => {
        try {
          setLoading(true);
          const res = await surveyCampaignService.getSurveyByToken(token);
          if (res.Success && res.Data) {
            setData(res.Data);
          } else {
            toast.error(res.Message || "Không thể tải dữ liệu câu trả lời");
            onOpenChange(false);
          }
        } catch {
          toast.error("Có lỗi xảy ra khi tải dữ liệu");
          onOpenChange(false);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      setData(null);
    }
  }, [open, token, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 shrink-0 border-b">
          <DialogTitle>Câu trả lời của {stakeholderName}</DialogTitle>
          <DialogDescription>
            Xem chi tiết các câu trả lời khảo sát
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : data ? (
            <SurveyReadOnlyView data={data} />
          ) : (
            <div className="text-center text-gray-500 pt-10">
              Chưa có dữ liệu hiển thị
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
