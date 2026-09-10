import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import MembreDetailPage from "./pages/membres/MembreDetailPage";
import MembreFormPage from "./pages/membres/MembreFormPage";
import MembresListPage from "./pages/membres/MembresListPage";
import { ROLE_LEVELS } from "./store/authStore";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Lecture ouverte à tout authentifié — le backend scope déjà le
            queryset par rôle (apps.membres.views.MembreViewSet). */}
        <Route path="/membres" element={<MembresListPage />} />
        <Route path="/membres/:id" element={<MembreDetailPage />} />
        {/* Créer/modifier reste RH+ côté API — gated ici pour ne pas
            afficher un formulaire inopérant. */}
        <Route
          path="/membres/nouveau"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <MembreFormPage />
            </RequireRole>
          }
        />
        <Route
          path="/membres/:id/modifier"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <MembreFormPage />
            </RequireRole>
          }
        />
        {/* Les routes suivantes sont ajoutées au fil des phases :
            /cotisation, /evenements, /boutique, /vote, /stats, /admin/* */}
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
