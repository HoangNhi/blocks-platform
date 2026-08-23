import { Navigate, Route, Routes } from "react-router"

import { LoginPage } from "./login-page"
import { RegistrationPage } from "./registration-page"

export function AuthEntryRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegistrationPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
