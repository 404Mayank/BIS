
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router";
import App from "./app/App.tsx";
import { LoginPage } from "./app/pages/login-page.tsx";
import { AdminPage } from "./app/pages/admin-page.tsx";
import { ComparePage } from "./app/pages/compare-page.tsx";
import { isLoggedIn } from "./app/services/auth-service.ts";
import "./styles/index.css";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><App /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      <Route path="/compare-models" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
    </Routes>
  </HashRouter>
);