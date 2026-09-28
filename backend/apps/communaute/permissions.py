"""
Permissions API — app communaute (CID-SCD-001 §résumé "Forum / Fil — RBAC"), tous les lots
(Fil d'actualité + Forum, Messagerie + Groupes, puis Live Match + Albums + Quiz — Phase 4B).

Règle commune aux deux sous-modules :
  - Lecture (list/retrieve) et création (create) : tout authentifié — pas de rôle
    minimum, à la différence de la Boutique (catalogue Bureau Admin+ en écriture). Le
    Forum/Fil est un espace social ouvert à tous les membres actifs (FDD §1.3 "Dans le
    périmètre" ne restreint pas Forum/Fil à un rôle).
  - Modifier/supprimer SON PROPRE contenu (publication, commentaire, sujet, réponse) :
    propriétaire uniquement (IDOR, même principe que CommandePermission).
  - Modération (masquer/épingler/verrouiller du contenu d'autrui) : Bureau Admin+
    uniquement (CID-SCD-001 "Modération admin"), même seuil que
    apps.boutique.permissions.GESTION_CATALOGUE_MIN_LEVEL.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access

MODERATION_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]

# Actions de modération exposées par les ViewSets (voir views.py) — jamais accessibles au
# simple propriétaire du contenu, uniquement Bureau Admin+.
MODERATION_ACTIONS = ("masquer", "epingler", "verrouiller")


def _membre_de(user):
    return getattr(user, "membre", None)


class ContenuCommunautePermission(BasePermission):
    """Permission générique pour Publication/Commentaire/Sujet/ReponseForum : partagée
    car les 4 modèles suivent exactement la même matrice (voir docstring module)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in MODERATION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        action = getattr(view, "action", None)
        if action in MODERATION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        if action in ("update", "partial_update", "destroy"):
            membre = _membre_de(user)
            est_proprietaire = membre is not None and getattr(obj, "auteur_id", None) == membre.id
            return est_proprietaire or ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True


# ---------------------------------------------------------------------------
# Messagerie privée + Groupes de chat (deuxième lot — CID-SCD-001 §résumé
# "Messagerie privée — chiffrée, accès strictement limité aux 2 participants")
# ---------------------------------------------------------------------------


class ConversationPermission(BasePermission):
    """Liste/création ouvertes à tout authentifié ; l'accès à UNE conversation (retrieve)
    est strictement limité à ses 2 participants — IDOR le plus sensible du module car la
    Messagerie privée est chiffrée précisément pour rester confidentielle."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        membre = _membre_de(request.user)
        return membre is not None and obj.participant(membre)


class MessagePrivePermission(BasePermission):
    """Authentifié uniquement pour lister — l'appartenance à la conversation ciblée par
    `?conversation=` est vérifiée explicitement dans `MessagePriveViewSet.get_queryset` (403
    plutôt qu'une liste vide silencieuse, pour ne pas laisser croire à une conversation
    inexistante). Supprimer SON PROPRE message (demande utilisateur du 2026-09-16 : "Nachricht
    ... kann vom Ersteller gelöscht werden") : expéditeur uniquement, jamais l'autre
    participant ni un modérateur — la messagerie privée reste strictement entre ses 2
    participants (voir ConversationPermission)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if getattr(view, "action", None) != "destroy":
            return True
        membre = _membre_de(request.user)
        return membre is not None and obj.expediteur_id == membre.id


class GroupeChatPermission(BasePermission):
    """Création ouverte à tout authentifié. Lecture (list/retrieve) : groupes publics OU
    dont le membre fait déjà partie — filtré dans `GroupeChatViewSet.get_queryset`, avec un
    contrôle objet en complément pour `retrieve`. Modifier/supprimer : créateur ou Bureau
    Admin+. `rejoindre` : groupes publics uniquement (un groupe privé se rejoint par
    invitation, voir `inviter`, réservée au créateur/Bureau Admin+). `quitter` : tout membre
    actuel du groupe."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action == "inviter":
            return True  # contrôle fin fait dans has_object_permission (créateur/Bureau Admin+)
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        membre = _membre_de(user)
        action = getattr(view, "action", None)
        est_createur = membre is not None and obj.createur_id == membre.id
        est_admin = ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        if action in ("update", "partial_update", "destroy", "inviter"):
            return est_createur or est_admin
        if action == "retrieve":
            if obj.type_groupe == "public":
                return True
            return membre is not None and obj.membres_groupe.filter(membre=membre).exists()
        if action == "rejoindre":
            return obj.type_groupe == "public"
        if action == "quitter":
            return membre is not None and obj.membres_groupe.filter(membre=membre).exists()
        return True


class MessageGroupePermission(BasePermission):
    """Authentifié uniquement pour lister — l'appartenance au groupe ciblé par `?groupe=` est
    vérifiée explicitement dans `MessageGroupeViewSet.get_queryset` (même principe que
    `MessagePrivePermission`). Supprimer SON PROPRE message (demande utilisateur du
    2026-09-16, même que ci-dessus) : auteur uniquement — pas de modération dédiée pour ce
    sous-module (un Bureau Admin+ ne peut pas supprimer le message d'un tiers, la demande ne
    porte que sur l'auteur/"Ersteller")."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if getattr(view, "action", None) != "destroy":
            return True
        membre = _membre_de(request.user)
        return membre is not None and obj.auteur_id == membre.id


# ---------------------------------------------------------------------------
# Live Match, Albums, Quiz (troisième lot — Phase 4B, voir docstring de tête models.py)
# ---------------------------------------------------------------------------


class MatchPermission(BasePermission):
    """Lecture (list/retrieve) ouverte à tout authentifié. Gestion (create/update/destroy —
    score, chrono, statut) réservée à Bureau Admin+ : le mockup ne propose aucune UI de
    pilotage du score côté membre standard."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action in ("create", "update", "partial_update", "destroy"):
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action in ("update", "partial_update", "destroy"):
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True


class MatchEvenementPermission(BasePermission):
    """Journal d'événements du Live-Ticker (module Fan-Club, 2026-09-24) — lecture (list)
    ouverte à tout authentifié, comme `MatchCommentairePermission`. Création (`create`)
    réservée à Bureau Admin+, EXACTEMENT le même seuil plat `MODERATION_MIN_LEVEL` que
    `MatchPermission` — délibérément NON migré vers la matrice RBAC par page
    (`apps.rbac.services.has_admin_page_access`), pour rester cohérent avec le Live Match
    lui-même (voir docstring de tête models.py et le commentaire équivalent sur
    MatchPermission ci-dessus). Aucune modification/suppression exposée pour l'instant (le
    Live-Ticker est un journal d'événements, pas un historique éditable)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action == "create":
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True


class GestionQuizPermission(BasePermission):
    """CRUD des questions/choix (endpoints d'administration séparés, voir views.py) — page de
    gestion "Quiz-Verwaltung" (Phase D, ajoutée le 2026-09-23, apps.rbac.registry.PAGES_ADMIN
    slug `page_quiz`) : un membre standard ne consulte jamais ces endpoints bruts, les questions
    lui sont exposées uniquement imbriquées dans `QuizSerializer` (avec `est_correct` masqué,
    voir `ChoixQuestionSerializer.to_representation`). Remplace (et non complète) l'ancien seuil
    fixe `MODERATION_MIN_LEVEL` — celui-ci reste inchangé pour `ContenuCommunautePermission`/
    `GroupeChatPermission`/`MatchPermission` ci-dessus, qui n'en font PAS partie.

    Lecture/écriture distinguées depuis le 2026-09-24 (retour utilisateur, voir QuizPermission
    ci-dessus pour le contexte complet) : `list`/`retrieve` (consulter les questions déjà créées)
    ne requiert que `lecture` ; `create`/`update`/`partial_update`/`destroy` requiert
    `lecture_ecriture`."""

    ACTIONS_ECRITURE = ("create", "update", "partial_update", "destroy")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        required = (
            NiveauAcces.LECTURE_ECRITURE
            if view.action in self.ACTIONS_ECRITURE
            else NiveauAcces.LECTURE
        )
        return has_admin_page_access(user, "page_quiz", required=required)


class MatchCommentairePermission(BasePermission):
    """Liste seule côté REST (historique) — l'envoi passe exclusivement par
    `LiveMatchConsumer` (voir consumers.py), même découpage que
    `MessagePrivePermission`/`MessageGroupeViewSet`."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)


class AlbumPermission(BasePermission):
    """Lecture ouverte à tout le monde, y compris un visiteur anonyme depuis le 2026-09-26
    (onglet Galerie de la page d'accueil publique, demande utilisateur) — Album n'a aucune
    notion de brouillon/publié (voir docstring de tête models.py), donc rien à filtrer en plus
    pour un anonyme : tous les albums existants sont déjà "publiés" de fait. Créer/modifier/
    supprimer un album (gestion) : page de gestion "Fotoalben-Verwaltung" (Phase D, ajoutée le
    2026-09-23, slug `page_albums`) — depuis le 2026-09-22 (retour utilisateur : "Im Modul
    Album, sollen Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin
    stattfinden"). Avant cette date, la création était ouverte à tout membre authentifié
    ("upload collaboratif") ; le module membre (`AlbumsPage`/`AlbumDetailPage` côté frontend)
    n'expose donc plus aucune action de gestion, seule `AdminAlbumsPage` le fait. Remplace (et
    non complète) l'ancien seuil fixe `MODERATION_MIN_LEVEL`. Niveau `lecture_ecriture` requis
    depuis le 2026-09-24 (voir QuizPermission pour le contexte complet du retour utilisateur) —
    `lecture` seule ne suffit plus à gérer un album."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action == "create":
            return has_admin_page_access(user, "page_albums", required=NiveauAcces.LECTURE_ECRITURE)
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action in ("update", "partial_update", "destroy"):
            return has_admin_page_access(user, "page_albums", required=NiveauAcces.LECTURE_ECRITURE)
        return True


class PhotoPermission(BasePermission):
    """Lecture ouverte à tout authentifié. Uploader une photo (create) : page de gestion
    "Fotoalben-Verwaltung" (Phase D, slug `page_albums`) exclusivement depuis le 2026-09-22, même
    changement que AlbumPermission ci-dessus — un album se gère désormais entièrement depuis
    l'admin, upload de photos compris. Modifier (légende) ou supprimer SA PROPRE photo (déjà
    uploadée avant ce changement, ou par un admin) : le membre qui l'a uploadée, ou un titulaire
    de `page_albums` — conservé tel quel, supprimer son propre contenu n'est pas de la "gestion"
    d'album. `masquer` (modération) : `page_albums` uniquement — voir docstring de tête models.py
    (pas de modération dédiée sur les likes/commentaires de photo, contrairement au Fil
    d'actualité — non documentée pour ce sous-module). Niveau `lecture_ecriture` requis depuis
    le 2026-09-24 pour `create`/`masquer`/gestion d'une photo d'autrui, même raisonnement que
    AlbumPermission ci-dessus."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action in ("create", "masquer"):
            return has_admin_page_access(user, "page_albums", required=NiveauAcces.LECTURE_ECRITURE)
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action == "masquer":
            return has_admin_page_access(user, "page_albums", required=NiveauAcces.LECTURE_ECRITURE)
        if view.action in ("update", "partial_update", "destroy"):
            membre = _membre_de(user)
            est_proprietaire = membre is not None and obj.membre_id == membre.id
            return est_proprietaire or has_admin_page_access(
                user, "page_albums", required=NiveauAcces.LECTURE_ECRITURE
            )
        return True


class PhotoCommentairePermission(BasePermission):
    """Créer : tout authentifié. Supprimer : auteur uniquement (pas de modération dédiée
    pour ce sous-module, voir docstring de tête models.py)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        membre = _membre_de(request.user)
        return membre is not None and obj.auteur_id == membre.id


class QuizPermission(BasePermission):
    """Lecture (list/retrieve) et participation (`demarrer`/`repondre`/`classement`) : tout
    authentifié. Gestion (create/update/destroy de l'objet Quiz lui-même) : page de gestion
    "Quiz-Verwaltung" (Phase D, slug `page_quiz`), niveau ÉCRITURE requis (voir
    GestionQuizPermission ci-dessous pour les questions/choix imbriqués — même page, même
    niveau). BUG corrigé le 2026-09-24 (retour utilisateur : Directeur Financier avec
    `page_quiz=lecture` pouvait quand même créer un quiz) : cette classe était restée sur
    l'ancien seuil fixe `MODERATION_MIN_LEVEL` lors du passage Phase D — DIR_FINANCIER (niveau
    4) dépasse MODERATION_MIN_LEVEL (Bureau Admin, niveau 3) indépendamment de la matrice, donc
    la cellule de la matrice n'avait jamais d'effet réel sur la création d'un Quiz, seulement
    sur ses questions/choix (GestionQuizPermission, elle bien migrée)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action in ("create", "update", "partial_update", "destroy"):
            return has_admin_page_access(user, "page_quiz", required=NiveauAcces.LECTURE_ECRITURE)
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action in ("update", "partial_update", "destroy"):
            return has_admin_page_access(user, "page_quiz", required=NiveauAcces.LECTURE_ECRITURE)
        return True


# ---------------------------------------------------------------------------
# Tippspiel (pronostics Ligue 1) — quatrième lot, ajouté le 2026-09-24. Seuils plats
# (pas de matrice RBAC par page, décision cohérente avec MatchPermission/
# MatchEvenementPermission ci-dessus) : décisions utilisateur explicites (AskUserQuestion
# du 2026-09-24) — gestion du jeu réservée à l'Administrateur App (`super_admin`, PAS
# seulement Bureau Admin+ comme pour Live Match : "Nur der App Admin kann das Spiel
# einstellen"), confirmation de paiement réservée au Directeur Financier+.
# ---------------------------------------------------------------------------

SUPER_ADMIN_MIN_LEVEL = ROLE_LEVELS[Role.SUPER_ADMIN]
DIR_FINANCIER_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]


class TippspielPermission(BasePermission):
    """Lecture (list/retrieve) : tout authentifié — un Tippspiel `brouillon` n'est
    cependant retourné qu'à l'Administrateur App, filtré dans
    `TippspielViewSet.get_queryset` ("Anzeigbar nachdem es eingestellt und
    veröffentlicht wird", retour utilisateur) ; ce contrôle-ci ne porte donc que sur
    l'écriture. Créer/modifier/supprimer (y compris définir les lots imbriqués, voir
    TippspielSerializer) : Administrateur App (`super_admin`) exclusivement — seuil
    plus strict que `MODERATION_MIN_LEVEL` (Bureau Admin+) utilisé ailleurs dans ce
    module, décision utilisateur explicite ("Nur der App Admin kann das Spiel
    einstellen")."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action in ("create", "update", "partial_update", "destroy"):
            return ROLE_LEVELS.get(user.role, 0) >= SUPER_ADMIN_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action in ("update", "partial_update", "destroy"):
            return ROLE_LEVELS.get(user.role, 0) >= SUPER_ADMIN_MIN_LEVEL
        return True


class TippspielTeilnahmePermission(BasePermission):
    """`teilnehmen` (rejoindre un Tippspiel) et `list` (classement, lecture seule — ne
    contient jamais les pronostics d'autrui, uniquement membre+total de points, voir
    TippspielTeilnahmeSerializer) : tout authentifié — "Jeder Mitglied kann daran
    teilnehmen" (retour utilisateur). `confirmer-paiement` : Directeur Financier+
    exclusivement ("bestätigt vom Finanzdirektor", retour utilisateur)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action == "confirmer_paiement":
            return ROLE_LEVELS.get(user.role, 0) >= DIR_FINANCIER_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if view.action == "confirmer_paiement":
            return ROLE_LEVELS.get(user.role, 0) >= DIR_FINANCIER_MIN_LEVEL
        return True


class TippspielTipPermission(BasePermission):
    """Un membre gère STRICTEMENT ses propres pronostics — jamais ceux d'autrui, y
    compris en lecture (éviter qu'un participant consulte/copie le pronostic d'un autre
    avant la date-limite d'un match, ce qui viderait le jeu de son intérêt).
    `TippspielTipViewSet.get_queryset` filtre déjà sur
    `teilnahme__membre=request.user.membre` ; ce contrôle objet est une deuxième ligne
    de défense (IDOR, CLAUDE.md §8)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        membre = _membre_de(request.user)
        return membre is not None and obj.teilnahme.membre_id == membre.id


class ConfigurationSitePublicPermission(BasePermission):
    """GET public (AllowAny) — la page d'accueil publique (visiteur anonyme inclus) doit
    pouvoir récupérer l'URL de la vidéo de hero, même principe que ClassementLigueViewSet/
    RencontreCalendrierViewSet (widget "Club Africain Live" de la même page). PATCH réservé
    au Bureau Admin+ via un seuil `ROLE_LEVELS` direct — PAS via la matrice apps.rbac
    (PAGES_ADMIN, liste explicite des pages nommées par l'utilisateur, voir docstring
    apps.rbac.registry) : même choix que /admin/roles côté frontend (RequireRole
    minRoleLevel), volontairement hors matrice pour ce réglage ponctuel."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return (
            bool(user and user.is_authenticated)
            and ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]
        )


class EquipeLogoPermission(BasePermission):
    """Même principe que ConfigurationSitePublicPermission ci-dessus (2026-09-28, retour
    utilisateur "Fan-Club: Vereins-Logos anzeigen + Upload-Möglichkeit") : lecture (liste des
    logos) ouverte à AllowAny — les logos apparaissent sur la Startseite publique (widget
    "Club Africain Live"), même raisonnement que ClassementLigueViewSet/
    RencontreCalendrierViewSet — écriture (upload/suppression) réservée au Bureau Admin+ via
    un seuil `ROLE_LEVELS` direct, volontairement hors matrice apps.rbac (même choix que
    /admin/configuration-site)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return (
            bool(user and user.is_authenticated)
            and ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]
        )
