import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import ArticlesCatalogueCotisationPage from "./pages/admin/ArticlesCatalogueCotisationPage";
import GestionRolesPage from "./pages/admin/GestionRolesPage";
import InscriptionsEnAttentePage from "./pages/admin/InscriptionsEnAttentePage";
import ParametresNotificationPage from "./pages/admin/ParametresNotificationPage";
import AdminCampagnesPage from "./pages/adhesions/AdminCampagnesPage";
import AdminJustificatifsPage from "./pages/adhesions/AdminJustificatifsPage";
import MonAdhesionPage from "./pages/adhesions/MonAdhesionPage";
import AdminBoutiquePage from "./pages/boutique/AdminBoutiquePage";
import CataloguePage from "./pages/boutique/CataloguePage";
import CommandeRetourPage from "./pages/boutique/CommandeRetourPage";
import MesCommandesPage from "./pages/boutique/MesCommandesPage";
import PanierCommandePage from "./pages/boutique/PanierCommandePage";
import AdminQuizPage from "./pages/communaute/AdminQuizPage";
import AlbumDetailPage from "./pages/communaute/AlbumDetailPage";
import AlbumsPage from "./pages/communaute/AlbumsPage";
import FilPage from "./pages/communaute/FilPage";
import ForumPage from "./pages/communaute/ForumPage";
import ForumSujetPage from "./pages/communaute/ForumSujetPage";
import GroupeChatPage from "./pages/communaute/GroupeChatPage";
import GroupesPage from "./pages/communaute/GroupesPage";
import LiveMatchDetailPage from "./pages/communaute/LiveMatchDetailPage";
import LiveMatchPage from "./pages/communaute/LiveMatchPage";
import MessagerieConversationPage from "./pages/communaute/MessagerieConversationPage";
import MessageriePage from "./pages/communaute/MessageriePage";
import QuizDetailPage from "./pages/communaute/QuizDetailPage";
import QuizPage from "./pages/communaute/QuizPage";
import ConfigurationRelancePage from "./pages/cotisations/ConfigurationRelancePage";
import CotisationRetourPage from "./pages/cotisations/CotisationRetourPage";
import CotisationsEnAttentePage from "./pages/cotisations/CotisationsEnAttentePage";
import CotisationStepperPage from "./pages/cotisations/CotisationStepperPage";
import DashboardPage from "./pages/DashboardPage";
import AdminEventsPage from "./pages/evenements/AdminEventsPage";
import CovoituragePage from "./pages/evenements/CovoituragePage";
import EvenementsPage from "./pages/evenements/EvenementsPage";
import LoginPage from "./pages/LoginPage";
import MembreDetailPage from "./pages/membres/MembreDetailPage";
import MembreFormPage from "./pages/membres/MembreFormPage";
import MembreImportPage from "./pages/membres/MembreImportPage";
import MembresListPage from "./pages/membres/MembresListPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import StatsPage from "./pages/stats/StatsPage";
import CreerVoteWizardPage from "./pages/vote/CreerVoteWizardPage";
import VotePage from "./pages/vote/VotePage";
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
        {/* Retour depuis Stripe Checkout/PayPal Checkout (AHM-46, success_url/return_url et
            cancel_url — voir apps.cotisations.gateways) — ouvert à tout authentifié, même scope
            IDOR que le reste de CotisationViewSet (get_queryset). */}
        <Route path="/cotisation/retour" element={<CotisationRetourPage />} />
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
        {/* Échéances des relances par année (AHM-54, suite retour utilisateur sur AHM-18) —
            Directeur Financier/Admin uniquement, même niveau que ConfigurationRelancePermission
            côté API. */}
        <Route
          path="/cotisations/relances"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.dir_financier}>
              <ConfigurationRelancePage />
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
        {/* Gestion des rôles utilisateurs (SCD §4.2/§8.1) — Admin App uniquement, même gate que
            UsersListView/ChangeUserRoleView côté API. */}
        <Route
          path="/admin/roles"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.super_admin}>
              <GestionRolesPage />
            </RequireRole>
          }
        />
        {/* Catalogue d'articles de cotisation (retour utilisateur du 2026-09-17) — réservé à
            l'Administrateur App, même gate que ArticleCataloguePermission côté API. */}
        <Route
          path="/admin/articles-cotisation"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.super_admin}>
              <ArticlesCatalogueCotisationPage />
            </RequireRole>
          }
        />
        {/* Activation/désactivation des emails de notification par module (ajouté le
            2026-09-19) — Admin App uniquement, même gate que ParametresNotificationPermission
            côté API. */}
        <Route
          path="/admin/notifications"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.super_admin}>
              <ParametresNotificationPage />
            </RequireRole>
          }
        />
        {/* Boutique (mockup #pg-boutique/#pg-boutique-panier/#pg-admin-boutique, FDD §3.4) —
            catalogue et panier/commande ouverts à tout authentifié (le backend ne renvoie de
            toute façon que les produits publiés à un rôle < Bureau Admin, voir
            ProduitViewSet.get_queryset) ; gestion catalogue/commandes réservée Bureau Admin+,
            même niveau que CatalogueBoutiquePermission/ORDER_VISIBILITY_MIN_LEVEL côté API. */}
        <Route path="/boutique" element={<CataloguePage />} />
        <Route path="/boutique/panier" element={<PanierCommandePage />} />
        {/* "Mes commandes" (ajoutée le 2026-09-19) — corrige le lien de notification
            "/boutique/commandes" (confirmation/annulation/expédition, voir
            apps.boutique.notifications) qui ne pointait auparavant vers aucune route ;
            ?commande= met en évidence la commande visée (voir useDeepLinkCible). Ouverte à
            tout authentifié, même scope IDOR que le reste du module (CommandeViewSet.
            get_queryset ne renvoie de toute façon que les commandes du membre courant en
            dessous de Bureau Admin). */}
        <Route path="/boutique/commandes" element={<MesCommandesPage />} />
        {/* Retour de paiement en ligne (ajouté le 2026-09-17, même principe que
            /cotisation/retour) — cible de success_url/cancel_url (Stripe) et return_url/
            cancel_url (PayPal), voir apps.cotisations.gateways (partagé avec apps.boutique) —
            ouvert à tout authentifié, même scope IDOR que /boutique/commandes/{id}/. */}
        <Route path="/boutique/commande/retour" element={<CommandeRetourPage />} />
        <Route
          path="/admin/boutique"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminBoutiquePage />
            </RequireRole>
          }
        />
        {/* Statistiques & KPIs (mockup #pg-stats, FDD §5.3) — Admin/DG/Bureau Admin
            uniquement, même niveau que StatsPermission (STATS_MIN_LEVEL) côté API. */}
        <Route
          path="/stats"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <StatsPage />
            </RequireRole>
          }
        />
        {/* Votes & Élections (mockup #pg-vote/#m-create-vote, FDD §3.5/F-008, Phase 3) —
            lecture (liste + résultats post-clôture) ouverte à tout authentifié, même niveau
            que VoteSessionPermission côté API. Création/clôture réservées à l'ensemble de
            rôles explicite {Super Admin, Bureau Admin} — PAS un simple minRoleLevel : le
            Directeur Financier a un niveau numérique supérieur (ROLE_LEVELS.dir_financier=4 >
            bureau_admin=3) mais est explicitement exclu de la gestion des votes (voir
            ROLES_GESTION_VOTE côté backend, apps.vote.permissions). RequireRole (basé sur
            ROLE_LEVELS) laisserait donc passer le Dir. Financier à tort — la page gère elle-
            même cet accès (voir CreerVoteWizardPage), même principe que MembreFormPage. */}
        <Route path="/votes" element={<VotePage />} />
        <Route path="/votes/creer" element={<CreerVoteWizardPage />} />
        {/* Fil d'actualité + Forum (mockup #pg-fil/#pg-forum, Release Plan §3.2, Phase 4A) —
            ouverts à tout authentifié, même principe que /boutique et /votes : le backend
            scope déjà la visibilité (publications/sujets masqués visibles Bureau Admin+
            seulement, voir PublicationViewSet/SujetViewSet.get_queryset) et les actions de
            modération (masquer/épingler/verrouiller, voir ContenuCommunautePermission). */}
        <Route path="/fil" element={<FilPage />} />
        <Route path="/forum" element={<ForumPage />} />
        <Route path="/forum/:id" element={<ForumSujetPage />} />
        {/* Messagerie privée + Groupes de chat (mockup #pg-messagerie/#pg-groupes, Release
            Plan §3.2, Phase 4A/4B) — ouverts à tout authentifié ; l'IDOR sur une conversation
            (participants uniquement) et la visibilité des groupes privés sont imposés côté
            backend (ConversationPermission/GroupeChatPermission), ces routes n'ajoutent donc
            pas de RequireRole, même principe que /fil et /forum. L'envoi de messages ne passe
            jamais par ces pages REST mais par les hooks WebSocket dédiés (voir
            useMessagerieSocket/useGroupeChatSocket). */}
        <Route path="/messagerie" element={<MessageriePage />} />
        <Route path="/messagerie/:id" element={<MessagerieConversationPage />} />
        <Route path="/groupes" element={<GroupesPage />} />
        <Route path="/groupes/:id" element={<GroupeChatPage />} />
        {/* Live Match, Albums photos, Quiz (mockup #pg-live/#pg-albums/#pg-quiz, Release Plan
            §3.2, troisième lot Phase 4B) — ouverts à tout authentifié, même principe que /fil
            et /groupes : le backend scope déjà la visibilité et réserve la gestion (piloter un
            match, modérer une photo, gérer un quiz) à Bureau Admin+ (voir MatchPermission/
            AlbumPermission/PhotoPermission/QuizPermission côté API) ; ces routes n'ajoutent
            donc pas de RequireRole, les pages elles-mêmes masquent les actions de gestion.
            L'envoi des commentaires/réactions du Live Match ne passe jamais par REST mais par
            useLiveMatchSocket, même principe que /groupes/:id. */}
        <Route path="/live" element={<LiveMatchPage />} />
        <Route path="/live/:id" element={<LiveMatchDetailPage />} />
        <Route path="/albums" element={<AlbumsPage />} />
        <Route path="/albums/:id" element={<AlbumDetailPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/:id" element={<QuizDetailPage />} />
        {/* Gestion des quiz (mockup #pg-quiz, Bureau Admin+) — création de quiz/questions/choix,
            même niveau que GestionQuizPermission côté API. Corrige le bug remonté en test
            manuel Phase 4 ("beim Quiz ist es nicht möglich Quiz anzulegen") : jusqu'ici, cette
            gestion n'avait aucune UI (voir QuizPage — "gérée hors application pour l'instant"). */}
        <Route
          path="/admin/quiz"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminQuizPage />
            </RequireRole>
          }
        />
        {/* Événements + Covoiturage (mockup #pg-evenements/#pg-covoiturage/#pg-admin-events,
            FDD §3.4/F-005/F-006/F-007, Phase 2A) — catalogue/inscription et covoiturage ouverts
            à tout authentifié, même principe que /boutique et /votes : le backend ne renvoie de
            toute façon que les événements publiés à un rôle < Bureau Admin (voir
            EvenementViewSet.get_queryset) et impose déjà l'IDOR sur les inscriptions/réservations
            (InscriptionPermission/ReservationCovoituragePermission) ; gestion du catalogue
            (créer/modifier/publier/annuler) réservée Bureau Admin+, même niveau que
            EvenementPermission côté API. */}
        <Route path="/evenements" element={<EvenementsPage />} />
        <Route path="/covoiturage" element={<CovoituragePage />} />
        <Route
          path="/admin/events"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminEventsPage />
            </RequireRole>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
