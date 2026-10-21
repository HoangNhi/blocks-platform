import type { SurveyView } from "../../../types/survey-campaign.types";
import { Star, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface SurveyReadOnlyViewProps {
  data: SurveyView;
}

export const SurveyReadOnlyView = ({ data }: SurveyReadOnlyViewProps) => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <div className="text-center space-y-2 border-b pb-6">
        <h1 className="text-3xl font-bold text-gray-900">{data.Name}</h1>
        <div className="flex justify-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Đã hoàn thành
          </span>
        </div>
      </div>

      <div className="space-y-8">
        {data.ListTopic.map((topic, tIndex) => (
          <div key={topic.Id} className="space-y-6">
            <div className="flex items-start gap-3 bg-blue-50 p-4 rounded-lg">
              <span className="shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-700 font-bold rounded-full">
                {tIndex + 1}
              </span>
              <div>
                <h2 className="text-xl font-semibold text-gray-800">
                  {topic.Title}
                </h2>
              </div>
            </div>

            {/* Standard Questions */}
            <div className="space-y-6 pl-4">
              {topic.ListCategory.map((category) => (
                <div key={category.Id} className="space-y-4">
                  <h3 className="font-medium text-gray-700 border-l-4 border-blue-200 pl-3">
                    {category.Name}
                  </h3>
                  <div className="space-y-4">
                    {category.ListQuestion.map((question, qIndex) => (
                      <div
                        key={question.Id}
                        className="bg-gray-50 border border-gray-100 rounded-lg p-4 transition-all hover:border-gray-200"
                      >
                        <div className="flex flex-col gap-3">
                          <p className="text-gray-900 font-medium">
                            {qIndex + 1}. {question.Content}
                          </p>

                          <div className="flex items-center gap-1 pt-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  "w-6 h-6",
                                  (question.Score || 0) >= star
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-gray-100 text-gray-300",
                                )}
                              />
                            ))}
                            <span className="ml-2 text-sm text-gray-500 font-medium">
                              ({question.Score || 0}/5)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Text Questions */}
            {topic.ListTextQuestion && topic.ListTextQuestion.length > 0 && (
              <div className="space-y-4 pl-4 pt-4 border-t border-dashed">
                <div className="flex items-center gap-2 text-gray-800 font-semibold">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <h3>{topic.TextQuestionTitle || "Ý kiến khác"}</h3>
                </div>

                <div className="space-y-4">
                  {topic.ListTextQuestion.map((tq) => (
                    <div key={tq.Id} className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">
                        {tq.Content}
                      </p>
                      <div className="p-3 bg-gray-50 border rounded-md text-gray-800 text-sm whitespace-pre-wrap">
                        {tq.Answer || (
                          <span className="text-gray-400 italic">
                            Không ý kiến
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
