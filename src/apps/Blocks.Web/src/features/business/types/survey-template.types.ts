import type { BaseRequest } from "@/types/base/base.types";

export interface SurveyTemplate extends BaseRequest {
  Id: string;
  Title: string;
  StakeholderType: number;
  Description?: string;
  ListTopic: TemplateTopic[];
}

export interface TemplateTextQuestion extends BaseRequest {
  Id: string;
  TopicId: string;
  Content: string;
  Sort: number;
  IsRequired: boolean;
}

export interface TemplateQuestion extends BaseRequest {
  Id: string;
  CategoryId: string;
  Content: string;
  Sort: number;
}

export interface TemplateCategory extends BaseRequest {
  Id: string;
  TopicId: string;
  Name: string;
  Sort: number;
  ListQuestion: TemplateQuestion[];
}

export interface TemplateTopic extends BaseRequest {
  Id: string;
  Title: string;
  HasTextQuestionPart: boolean;
  TextQuestionTitle?: string;
  Sort: number;
  ListCategory: TemplateCategory[];
  ListTextQuestion: TemplateTextQuestion[];
}

export interface SurveyTemplateGetListPaging extends SurveyTemplate {
  Stakeholder: string;
}

// Request
export interface SurveyTemplateGetListPagingRequest extends BaseRequest {
  StakeholderType?: number;
  TextSearch?: string;
  PageIndex: number;
  PageSize: number;
}

export interface SurveyTemplateGetComboboxRequest {
  StakeholderType?: number;
}
