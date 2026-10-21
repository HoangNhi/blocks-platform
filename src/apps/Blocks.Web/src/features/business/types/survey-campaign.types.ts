import type {
  BaseRequest,
  GetListPagingRequest,
} from "@/types/base/base.types";
import type { TemplateTopic } from "./survey-template.types";

// Model
export interface SurveyCampaign extends BaseRequest {
  Id: string;
  CycleId: string;
  TemplateId: string;
  StakeholderType: number;
  Name: string;
  CycleName?: string;
  Status: number;
  ListSession: SurveySession[];
  ListScore: SurveyScore[];
  ListTextAnswer: SurveyTextAnswer[];
  ListTopic?: TemplateTopic[];
}

export interface SurveySession extends BaseRequest {
  Id: string;
  CampaignId: string;
  StakeholderId: string;
  StakeholderName?: string;
  StakeholderEmail?: string;
  Token?: string;
  Status: number;
  SentDate?: string;
  SubmittedDate?: string;
}

export interface SurveyScore extends BaseRequest {
  Id: string;
  CampaignId: string;
  QuestionId: string;
  SessionId: string;
  Score: number;
}

export interface SurveyTextAnswer extends BaseRequest {
  Id: string;
  CampaignId: string;
  TextQuestionId: string;
  SessionId: string;
  Content: string;
}

// Request
export interface SurveyCampaignGetListPaging extends SurveyCampaign {
  Cycle: string;
  Stakeholder: string;
}

export interface SurveyCampaignGetListPagingRequest extends GetListPagingRequest {
  StakeholderType?: number;
  CycleId?: string;
}

export interface GetStakeholderNotInCampaignRequest extends GetListPagingRequest {
  CampainId: string;
}

export interface GetListSessionRequest extends GetListPagingRequest {
  CampaignId: string;
  Status?: number;
}

export interface AddAllStakeholderToCampaignRequest {
  CampaignId: string;
  Filter_TextSearch?: string;
}

export interface AddListStakeholderToCampaignRequest {
  CampaignId: string;
  StakeholderIds: string[];
}

export interface SurveySubmissionScore {
  QuestionId: string;
  Score: number;
}

export interface SurveySubmissionTextAnswer {
  TextQuestionId: string;
  Content: string;
}

export interface SurveySubmissionRequest {
  Token: string;
  Scores: SurveySubmissionScore[];
  TextAnswers: SurveySubmissionTextAnswer[];
}

// View Types (Do Survey)
import type {
  TemplateCategory,
  TemplateQuestion,
  TemplateTextQuestion,
} from "./survey-template.types";

export interface SurveyView {
  Id: string;
  Name: string;
  StakeholderType: number;
  IsSessionCompleted: boolean;
  ListTopic: SurveyViewTopic[];
}

export interface SurveyViewTopic extends Omit<
  TemplateTopic,
  "ListCategory" | "ListTextQuestion"
> {
  ListCategory: SurveyViewCategory[];
  ListTextQuestion: SurveyViewTextQuestion[];
}

export interface SurveyViewCategory extends Omit<
  TemplateCategory,
  "ListQuestion"
> {
  ListQuestion: SurveyViewQuestion[];
}

export interface SurveyViewQuestion extends TemplateQuestion {
  Score?: number;
}

export interface SurveyViewTextQuestion extends TemplateTextQuestion {
  Answer?: string;
}

// Aggregated Results
export interface AggregatedSurveyResult {
  CampaignId: string;
  TotalRespondents: number;
  Topics: AggregatedTopic[];
}

export interface AggregatedTopic {
  TopicId: string;
  Title: string;
  Sort: number;
  Categories: AggregatedCategory[];
  TextQuestions: AggregatedTextQuestion[];
}

export interface AggregatedCategory {
  CategoryId: string;
  Name: string;
  Sort: number;
  Questions: AggregatedRatingQuestion[];
}

export interface AggregatedRatingQuestion {
  QuestionId: string;
  Content: string;
  Sort: number;
  Score1Count: number;
  Score2Count: number;
  Score3Count: number;
  Score4Count: number;
  Score5Count: number;
  Total: number;
}

export interface AggregatedTextQuestion {
  TextQuestionId: string;
  Content: string;
  Sort: number;
  Answers: AnswerFrequency[];
}

export interface AnswerFrequency {
  Content: string;
  Frequency: number;
}
