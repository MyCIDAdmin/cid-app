import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import CotisationStepperPage from "./pages/cotisations/CotisationStepperPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import MembreDetailPage from "./pages/membres/MembreDetailPage";
import MembreFormPage from "./pages/membres/MembreFormPage";
import MembreImportPage from "./pages/membres/MembreImportPage";
import MembresListPage from "./pages/membres/MembresListPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { ROLE_LEVELS } from "./store/authStore";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Inscription libre-service (mockup #sc-register, FDD §3.1/F-002,
          AHM-47) — compte créé inactif, activation décidée ensuite par
          RH/Admin (AHM-48). */}
      <Route path="/register" element={<RegisterPage />} />
      {/* Réinitialisation de mot de passe (mockup #sc-login, FDD §3.1) —
          demande d'email puis confirmation via le lien reçu (?token=). */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        {/* Import Excel (RICEFW W-008/F-019) — même gate RH+ que
            MembreImportView côté API. */}
        <Route
          path="/membres/import"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <MembreImportPage />
            </RequireRole>
          }
        />
        {/* Paiement libre-service (mockup #pg-cotisation, RICEFW F-004, AHM-16) —
            ouvert à tout authentifié : le backend scope déjà le queryset et
            résout le membre courant à la création (CotisationViewSet). */}
        <Route path="/cotisation" element={<CotisationStepperPage />} />
        {/* Les routes suivantes sont ajoutées au fil des phases :
            /evenements, /boutique, /vote, /stats, /admin/* */}
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
