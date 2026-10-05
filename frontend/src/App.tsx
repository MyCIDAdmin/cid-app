import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import AdminConfigurationSitePage from "./pages/admin/AdminConfigurationSitePage";
import AdminFanClubLogosPage from "./pages/admin/AdminFanClubLogosPage";
import ArticlesCatalogueCotisationPage from "./pages/admin/ArticlesCatalogueCotisationPage";
import GestionRolesPage from "./pages/admin/GestionRolesPage";
import InscriptionsEnAttentePage from "./pages/admin/InscriptionsEnAttentePage";
import ParametresNotificationPage from "./pages/admin/ParametresNotificationPage";
import AdminCampagnesPage from "./pages/adhesions/AdminCampagnesPage";
import AdminJustificatifsPage from "./pages/adhesions/AdminJustificatifsPage";
import MonAdhesionPage from "./pages/adhesions/MonAdhesionPage";
import AdminBoutiquePage from "./pages/boutique/AdminBoutiquePage";
import BoutiquePage from "./pages/boutique/BoutiquePage";
import CommandeRetourPage from "./pages/boutique/CommandeRetourPage";
import PanierCommandePage from "./pages/boutique/PanierCommandePage";
import ProduitDetailPage from "./pages/boutique/ProduitDetailPage";
import AdminAlbumsPage from "./pages/communaute/AdminAlbumsPage";
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
import CotisationRedirect from "./pages/cotisations/CotisationRedirect";
import CotisationRetourPage from "./pages/cotisations/CotisationRetourPage";
import CotisationsEnAttentePage from "./pages/cotisations/CotisationsEnAttentePage";
import DashboardPage from "./pages/DashboardPage";
import AdminEventsPage from "./pages/evenements/AdminEventsPage";
import CovoituragePage from "./pages/evenements/CovoituragePage";
import EvenementsPage from "./pages/evenements/EvenementsPage";
import LoginPage from "./pages/LoginPage";
import MembreDetailPage from "./pages/membres/MembreDetailPage";
import AccueilTab from "./components/public/AccueilTab";
import PublicEvenementsTab from "./components/public/PublicEvenementsTab";
import HomeRoute from "./pages/public/HomeRoute";
import DatenschutzPage from "./pages/public/legal/DatenschutzPage";
import ErstattungsrichtliniePage from "./pages/public/legal/ErstattungsrichtliniePage";
import ImpressumPage from "./pages/public/legal/ImpressumPage";
import NutzungsbedingungenPage from "./pages/public/legal/NutzungsbedingungenPage";
import MembreFormPage from "./pages/membres/MembreFormPage";
import MembreImportPage from "./pages/membres/MembreImportPage";
import MembresListPage from "./pages/membres/MembresListPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import AdminProjetsPage from "./pages/projets/AdminProjetsPage";
import ProjetDetailPage from "./pages/projets/ProjetDetailPage";
import ProjetsPage from "./pages/projets/ProjetsPage";
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
      {/* Pages légales (retour utilisateur du 2026-09-28, points 3.1-3.4 : nachbau des pages
          mycid.org/{impressum,privacy,terms,refund-policy}, voir pages/public/legal/) —
          toujours publiques (jamais derrière RequireAuth), reliées depuis PublicFooter.tsx qui
          s'affiche aussi bien sur la Startseite publique que dans l'app connectée. */}
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/datenschutz" element={<DatenschutzPage />} />
      <Route path="/nutzungsbedingungen" element={<NutzungsbedingungenPage />} />
      <Route path="/erstattungsrichtlinie" element={<ErstattungsrichtliniePage />} />
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
        {/* Profil personnel (bouton "Mein Profil" du menu utilisateur, ajouté le 2026-09-28) —
            ouvert à tout authentifié, sans RequireRole : MembreFormPage bascule en mode profil
            (via useMembreMoi/useUpdateMembreMoi) sur ce chemin exact, voir sa docstring de tête.
            Un compte sans fiche Membre liée (superuser, RH créé hors auto-inscription) voit un
            message explicite plutôt qu'un formulaire cassé (404 de /membres/moi/). */}
        <Route path="/mon-profil" element={<MembreFormPage />} />
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
        {/* Phase F (2026-09-26, fusion "Mitgliedsbeitrag" -> "Meine Mitgliedschaft", exigence
            utilisateur non négociable) : le stepper de paiement libre-service (mockup
            #pg-cotisation, RICEFW F-004, AHM-16) vit désormais entièrement sous /mon-adhesion
            (voir PaiementStepper.tsx, rendu par MonAdhesionPage.tsx). Cette route reste
            techniquement présente — non retirée d'App.tsx — uniquement pour que les deep-links
            existants (?paiement=...) depuis Événements/Projets continuent de fonctionner ; elle
            ne rend plus qu'un redirect. */}
        <Route path="/cotisation" element={<CotisationRedirect />} />
        {/* Retour depuis Stripe Checkout/PayPal Checkout (AHM-46, success_url/return_url et
            cancel_url — voir apps.cotisations.gateways) — ouvert à tout authentifié, même scope
            IDOR que le reste de CotisationViewSet (get_queryset). */}
        <Route path="/cotisation/retour" element={<CotisationRetourPage />} />
        {/* Confirmation manuelle des paiements en attente (virement SEPA en cours de
            réconciliation, etc., AHM-53) — Directeur Financier/Admin uniquement, même niveau
            que SAISIE_POUR_AUTRUI_MIN_LEVEL / marquer_payee côté API. */}
        {/* Phase D (matrice de gestion, ajoutée le 2026-09-23) : accès désormais piloté par la
            matrice apps.rbac (page_cotisations_attente) plutôt qu'un seuil ROLE_LEVELS statique
            — même page, seuil de départ inchangé (Directeur Financier/Admin), mais un admin peut
            désormais l'ouvrir/fermer par rôle système sans déploiement. */}
        <Route
          path="/cotisations/en-attente"
          element={
            <RequireRole pageSlug="page_cotisations_attente">
              <CotisationsEnAttentePage />
            </RequireRole>
          }
        />
        {/* Échéances des relances par année (AHM-54, suite retour utilisateur sur AHM-18) —
            Phase D : piloté par la matrice (page_cotisations_relances), voir note ci-dessus. */}
        <Route
          path="/cotisations/relances"
          element={
            <RequireRole pageSlug="page_cotisations_relances">
              <ConfigurationRelancePage />
            </RequireRole>
          }
        />
        {/* Adhésions (mockup #pg-mon-adhesion / #pg-admin-adhesion, AHM-21) —
            page membre ouverte à tout authentifié (campagne active, offres,
            souscription, historique) ; gestion des campagnes réservée
            Bureau Admin+ (même niveau que CataloguePermission côté API). */}
        <Route path="/mon-adhesion" element={<MonAdhesionPage />} />
        {/* Phase D : piloté par la matrice (page_campagnes_adhesion), seuil de départ inchangé
            (Bureau Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/campagnes-adhesion"
          element={
            <RequireRole pageSlug="page_campagnes_adhesion">
              <AdminCampagnesPage />
            </RequireRole>
          }
        />
        {/* File de validation des justificatifs (FDD §4.5, RICEFW R-ADH-05, AHM-20) — Phase D :
            piloté par la matrice (page_justificatifs), seuil de départ inchangé (RH+). */}
        <Route
          path="/admin/justificatifs"
          element={
            <RequireRole pageSlug="page_justificatifs">
              <AdminJustificatifsPage />
            </RequireRole>
          }
        />
        {/* Validation des inscriptions libre-service (FDD §3.1, AHM-48) — Phase D : piloté par
            la matrice (page_inscriptions), seuil de départ inchangé (RH+). */}
        <Route
          path="/inscriptions"
          element={
            <RequireRole pageSlug="page_inscriptions">
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
        {/* Vidéo de fond du hero de la page d'accueil publique (demande utilisateur du
            2026-09-27, Phase 5 "Startseite Hero-Video") — `minRoleLevel` direct plutôt qu'un
            pageSlug de la matrice apps.rbac (PAGES_ADMIN est une liste EXPLICITE des pages
            nommées par l'utilisateur), même choix que /admin/roles ci-dessus. */}
        <Route
          path="/admin/configuration-site"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminConfigurationSitePage />
            </RequireRole>
          }
        />
        {/* Logos d'équipes du Fan-Club (retour utilisateur du 2026-09-28 : "Fan-Club:
            Vereins-Logos anzeigen + Upload-Möglichkeit") — même raisonnement que
            /admin/configuration-site ci-dessus (minRoleLevel direct, hors matrice apps.rbac). */}
        <Route
          path="/admin/fan-club-logos"
          element={
            <RequireRole minRoleLevel={ROLE_LEVELS.bureau_admin}>
              <AdminFanClubLogosPage />
            </RequireRole>
          }
        />
        {/* Catalogue d'articles de cotisation (retour utilisateur du 2026-09-17) — Phase D :
            piloté par la matrice (page_articles_cotisation), seuil de départ inchangé
            (Administrateur App). */}
        <Route
          path="/admin/articles-cotisation"
          element={
            <RequireRole pageSlug="page_articles_cotisation">
              <ArticlesCatalogueCotisationPage />
            </RequireRole>
          }
        />
        {/* Activation/désactivation des emails de notification par module (ajouté le
            2026-09-19) — Phase D : piloté par la matrice (page_notifications_params), seuil de
            départ inchangé (Administrateur App). */}
        <Route
          path="/admin/notifications"
          element={
            <RequireRole pageSlug="page_notifications_params">
              <ParametresNotificationPage />
            </RequireRole>
          }
        />
        {/* Boutique (mockup #pg-boutique/#pg-boutique-panier/#pg-admin-boutique, FDD §3.4) —
            catalogue, "Mes commandes" et "Mes bons d'achat" fusionnés en un seul point d'entrée
            depuis le 2026-09-23 (retour utilisateur : "'Meine Bestellungen' und 'Meine
            Gutscheine' in die Boutique verschieben" — voir BoutiquePage, pilotée par `?onglet=`
            plutôt que par des routes dédiées ; ?commande=/?bon= mettent en évidence l'élément
            visé par une notification, voir useDeepLinkCible). Ouverte à tout authentifié (le
            backend ne renvoie de toute façon que les produits publiés à un rôle < Bureau Admin,
            voir ProduitViewSet.get_queryset ; même scope IDOR pour les commandes/bons du membre
            courant, voir CommandeViewSet/BonAchatViewSet.get_queryset) ; gestion catalogue/
            commandes réservée Bureau Admin+, même niveau que CatalogueBoutiquePermission/
            ORDER_VISIBILITY_MIN_LEVEL côté API.
            Un bon d'achat (demande utilisateur du 2026-09-23 : "Es soll möglich sein Gutscheine
            zu Kaufen") n'a plus sa propre page d'achat depuis le même jour ("Gutschein soll als
            Kategorie im shop auftauchen und nicht als eigenes Modul") : c'est désormais un
            produit du catalogue comme un autre (voir CataloguePage), acheté via le panier/
            passer() normal — /boutique/bon-achat/acheter est donc retirée. */}
        <Route path="/boutique" element={<BoutiquePage />} />
        <Route path="/boutique/panier" element={<PanierCommandePage />} />
        {/* Retour de paiement en ligne (ajouté le 2026-09-17, même principe que
            /cotisation/retour) — cible de success_url/cancel_url (Stripe) et return_url/
            cancel_url (PayPal), voir apps.cotisations.gateways (partagé avec apps.boutique) —
            ouvert à tout authentifié, même scope IDOR que /boutique/commandes/{id}/. */}
        <Route path="/boutique/commande/retour" element={<CommandeRetourPage />} />
        {/* Détail d'un produit (demande utilisateur 2026-09-26, voir docstring ProduitDetailPage
            — porte la structure de https://www.mycid.org/shop/:id) ; React Router priorise déjà
            les segments statiques (/boutique/panier, /boutique/commande/retour) sur ce `:id`
            quel que soit l'ordre de déclaration, donc pas de conflit de route. Même scope
            d'accès que /boutique (le backend ne renvoie de toute façon que les produits publiés
            à un rôle < Bureau Admin, voir ProduitViewSet.get_queryset). */}
        <Route path="/boutique/:id" element={<ProduitDetailPage />} />
        {/* Phase D : piloté par la matrice (page_boutique), seuil de départ inchangé (Bureau
            Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/boutique"
          element={
            <RequireRole pageSlug="page_boutique">
              <AdminBoutiquePage />
            </RequireRole>
          }
        />
        {/* Statistiques & KPIs (mockup #pg-stats, FDD §5.3) — Phase D : piloté par la matrice
            (page_stats), seuil de départ inchangé (Bureau Admin+). */}
        <Route
          path="/stats"
          element={
            <RequireRole pageSlug="page_stats">
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
        {/* Albums photos (resserré le 2026-09-22 sur demande utilisateur : "Im Modul Album,
            sollen Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin
            stattfinden.") — la page membre reste ouverte à tout authentifié, en lecture seule
            (+ like/commentaire/suppression de sa propre photo) ; la création/modification/
            suppression d'album ET l'upload de photos passent désormais exclusivement par
            /admin/albums, réservée Bureau Admin+ comme le reste de cette section (même niveau
            qu'AlbumPermission/PhotoPermission côté API). */}
        <Route path="/albums" element={<AlbumsPage />} />
        <Route path="/albums/:id" element={<AlbumDetailPage />} />
        {/* Phase D : piloté par la matrice (page_albums), seuil de départ inchangé (Bureau
            Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/albums"
          element={
            <RequireRole pageSlug="page_albums">
              <AdminAlbumsPage />
            </RequireRole>
          }
        />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/:id" element={<QuizDetailPage />} />
        {/* Gestion des quiz (mockup #pg-quiz, Bureau Admin+) — création de quiz/questions/choix,
            même niveau que GestionQuizPermission côté API. Corrige le bug remonté en test
            manuel Phase 4 ("beim Quiz ist es nicht möglich Quiz anzulegen") : jusqu'ici, cette
            gestion n'avait aucune UI (voir QuizPage — "gérée hors application pour l'instant"). */}
        {/* Phase D : piloté par la matrice (page_quiz), seuil de départ inchangé (Bureau
            Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/quiz"
          element={
            <RequireRole pageSlug="page_quiz">
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
        {/* Phase D : piloté par la matrice (page_events), seuil de départ inchangé (Bureau
            Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/events"
          element={
            <RequireRole pageSlug="page_events">
              <AdminEventsPage />
            </RequireRole>
          }
        />
        {/* Projets & Actions (module ajouté le 2026-09-22 sur demande utilisateur) — kacheln
            ouvertes à tout authentifié, même principe que /evenements et /boutique : le backend
            ne renvoie de toute façon pas les projets "en_preparation" à un rôle < Bureau Admin
            (voir ProjetViewSet.get_queryset) et impose déjà l'IDOR sur le contenu de la kachel
            (GestionContenuProjetPermission/est_gestionnaire_projet) ; gestion complète du Projet
            lui-même (créer/modifier/statut/cagnote/échéance/responsable/images) réservée Bureau
            Admin+, même niveau que ProjetPermission côté API. */}
        <Route path="/projets" element={<ProjetsPage />} />
        {/* Détail d'un projet (demande utilisateur 2026-09-26 : porter la structure de
            https://www.mycid.org/projects — "View Project" ouvre une page dédiée, jamais une
            modale) — même niveau d'accès que /projets ci-dessus, voir docstring
            ProjetDetailPage. */}
        <Route path="/projets/:id" element={<ProjetDetailPage />} />
        {/* Phase D : piloté par la matrice (page_projets), seuil de départ inchangé (Bureau
            Admin+) — voir note Phase D plus haut. */}
        <Route
          path="/admin/projets"
          element={
            <RequireRole pageSlug="page_projets">
              <AdminProjetsPage />
            </RequireRole>
          }
        />
      </Route>
      {/* Page d'accueil (voir HomeRoute.tsx) : publique pour un visiteur ; pour un utilisateur
          connecté, même URL "/" mais dans l'AppLayout, sans la barre horizontale publique
          (demande utilisateur du 2026-10-05, point 1.2). */}
      <Route path="/" element={<HomeRoute />}>
        {/* Point 4 (2026-10-06) : la Startseite reste visible après connexion (membre ou
            non) — contenu d'accueil + Veranstaltungen avec les mêmes règles (badge "Nur für
            Mitglieder", bouton désactivé pour un non-membre). */}
        <Route
          index
          element={
            <>
              <AccueilTab />
              <PublicEvenementsTab />
            </>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
