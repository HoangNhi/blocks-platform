import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { surveyTemplateService } from "@/features/business/api/survey-template.api";

export function useSurveyTemplateOptions(stakeholderType?: number, enabled: boolean = true) {
    return useComboboxQuery(
        ["surveyTemplate-combobox", stakeholderType?.toString() || "all"],
        () => surveyTemplateService.getAllCombobox({ StakeholderType: stakeholderType }),
        enabled
    );
}
