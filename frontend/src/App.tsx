import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import InscriptionsEnAttentePage from "./pages/admin/InscriptionsEnAttentePage";
import AdminCampagnesPage from "./pages/adhesions/AdminCampagnesPage";
import AdminJustificatifsPage from "./pages/adhesions/AdminJustificatifsPage";
import MonAdhesionPage from "./pages/adhesions/MonAdhesionPage";
import CotisationsEnAttentePage from "./pages/cotisations/CotisationsEnAttentePage";
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
        {/* Créer reste RH+ côté API — gated ici pour ne pas afficher un
            formulaire inopérant. */}
        <Route
          path="/membres/nouveau"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <MembreFormPage />
            </RequireRole>
          }
        />
        {/* Modifier : RH+ sur n'importe quelle fiche, ou un Membre sur la
            sienne uniquement (AHM-51) — l'appartenance ne peut se vérifier
            qu'après chargement de la fiche, donc pas de RequireRole ici ;
            MembreFormPage gère elle-même l'accès (champs administratifs
            masqués, erreur si la fiche n'est pas la sienne) et le backend
            reste de toute façon la source de vérité (MembrePermission). */}
        <Route path="/membres/:id/modifier" element={<MembreFormPage />} />
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
        {/* Confirmation manuelle des paiements en attente (virement SEPA en cours de
            réconciliation, etc., AHM-53) — Directeur Financier/Admin uniquement, même niveau
            que SAISIE_POUR_AUTRUI_MIN_LEVEL / marquer_payee côté API. */}
        <Route
          path="/cotisations/en-attente"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.dir_financier}>
              <CotisationsEnAttentePage />
            </RequireRole>
          }
        />
        {/* Adhésions (mockup #pg-mon-adhesion / #pg-admin-adhesion, AHM-21) —
            page membre ouverte à tout authentifié (campagne active, offres,
            souscription, historique) ; gestion des campagnes réservée
            Bureau Admin+ (même niveau que CataloguePermission côté API). */}
        <Route path="/mon-adhesion" element={<MonAdhesionPage />} />
        <Route
          path="/admin/campagnes-adhesion"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminCampagnesPage />
            </RequireRole>
          }
        />
        {/* File de validation des justificatifs (FDD §4.5, RICEFW R-ADH-05, AHM-20) — RH+,
            même niveau que JustificatifPermission.RH_ONLY_ACTIONS côté API. */}
        <Route
          path="/admin/justificatifs"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <AdminJustificatifsPage />
            </RequireRole>
          }
        />
        {/* Validation des inscriptions libre-service (FDD §3.1, AHM-48) —
            RH+ uniquement, même gate que PendingRegistrationsView côté API. */}
        <Route
          path="/inscriptions"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.rh}>
              <InscriptionsEnAttentePage />
            </RequireRole>
          }
        />
        {/* Les routes suivantes sont ajoutées au fil des phases :
            /evenements, /boutique, /vote, /stats, /admin/* */}
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
