import type { FC } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/Home/HomePage.tsx";
import UserPage from "./features/system/routes/User/UserPage";
import MainLayout from "./components/layout/MainLayout/MainLayout";
import FacultyPage from "./features/catalog/routes/Faculty/FacultyPage";
import LoginPage from "./features/system/routes/Auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import SystemGroupPage from "./features/system/routes/SystemGroup/SystemGroupPage";
import MenuPage from "./features/system/routes/Menu/MenuPage";
import RolePage from "./features/system/routes/Role";
import UnauthorizedPage from "./pages/common/UnauthorizedPage";
import AuditLogPage from "./features/system/routes/AuditLog/AuditLogPage";
import NotFoundPage from "./pages/common/NotFoundPage";

const Router: FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated Routes */}
        <Route path="/login" element={<LoginPage />} />

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
          <Route path="/systemgroup" element={<SystemGroupPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/role" element={<RolePage />} />
          <Route path="/auditlog" element={<AuditLogPage />} />
        </Route>

        <Route element={<MainLayout />}>
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Route>

        {/* Fallback Route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default Router;