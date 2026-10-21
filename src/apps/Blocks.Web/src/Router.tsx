import type { FC } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/Home/HomePage.tsx";
import UserPage from "./features/system/routes/User/UserPage";
import MainLayout from "./components/layout/MainLayout/MainLayout";
import FacultyPage from "./features/catalog/routes/Faculty/FacultyPage";
import CyclePage from "./features/business/routes/Cycle/CyclePage";
import FileTypePage from "./features/catalog/routes/FileType/FileTypePage";
import EvidencePage from "./features/business/routes/Evidence/EvidencePage";
import EvidenceCycleMapPage from "./features/business/routes/EvidenceCycleMap/EvidenceCycleMapPage";
import LoginPage from "./features/system/routes/Auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import SystemGroupPage from "./features/system/routes/SystemGroup/SystemGroupPage";
import MenuPage from "./features/system/routes/Menu/MenuPage";
import RolePage from "./features/system/routes/Role";
import UnauthorizedPage from "./pages/common/UnauthorizedPage";
import StakeholderPage from "./features/catalog/routes/Stakeholder/StakeholderPage";
import SurveyTemplatePage from "./features/business/routes/SurveyTemplate/SurveyTemplatePage";
import SurveyCampaignPage from "./features/business/routes/SurveyCampaign/SurveyCampaignPage";
import StandardPage from "./features/catalog/routes/Standard/StandardPage";
import StandardSetPage from "./features/catalog/routes/StandardSet/StandardSetPage";
import AuditLogPage from "./features/system/routes/AuditLog/AuditLogPage";
import { CriterionEvaluationPage } from "./features/business/routes/CriterionEvaluation/CriterionEvaluationPage";
import SarPage from "./features/business/routes/Sar/SarPage";
import InternalReviewPage from "./features/business/routes/InternalReview/InternalReviewPage";
import ExternalReviewPage from "./features/business/routes/ExternalReview/ExternalReviewPage";
import ActionPlanPage from "./features/business/routes/ActionPlan/ActionPlanPage";
import TaskExecutionPage from "./features/business/routes/TaskExecution/TaskExecutionPage";

import { DoSurveyPage } from "./features/business/routes/SurveyCampaign/DoSurveyPage";

const Router: FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/survey/do-survey" element={<DoSurveyPage />} />

        {/* Authenticated Routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/user" element={<UserPage />} />
          <Route path="/faculty" element={<FacultyPage />} />
          <Route path="/cycle" element={<CyclePage />} />
          <Route path="/filetype" element={<FileTypePage />} />
          <Route path="/evidence" element={<EvidencePage />} />
          <Route path="/evidencecyclemap" element={<EvidenceCycleMapPage />} />
          <Route path="/systemgroup" element={<SystemGroupPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/role" element={<RolePage />} />
          <Route path="/stakeholder" element={<StakeholderPage />} />
          <Route path="/surveytemplate" element={<SurveyTemplatePage />} />
          <Route path="/surveycampaign" element={<SurveyCampaignPage />} />
          <Route path="/standard" element={<StandardPage />} />
          <Route path="/standardset" element={<StandardSetPage />} />
          <Route path="/auditlog" element={<AuditLogPage />} />
          <Route path="/criterionevaluation" element={<CriterionEvaluationPage />} />
          <Route path="/sar" element={<SarPage />} />
          <Route path="/internalreview" element={<InternalReviewPage />} />
          <Route path="/externalreview" element={<ExternalReviewPage />} />
          <Route path="/actionplan" element={<ActionPlanPage />} />
          <Route path="/taskexecution" element={<TaskExecutionPage />} />
        </Route>

        <Route element={<MainLayout />}>
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default Router;


