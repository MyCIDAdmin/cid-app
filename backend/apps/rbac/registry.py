"""
Registre des modules métier — app rbac (ajouté le 2026-09-23).

Même convention que `apps.notifications.models.MODULES_NOTIFIABLES` (déjà un précédent dans ce
projet pour "une liste Python de modules togglables") : une simple constante, miroir des préfixes
déjà déclarés dans `config/urls.py`/`LOCAL_APPS`. `apps.accounts` est volontairement exclu — c'est
le module d'identité/authentification lui-même, jamais un module métier "accessible en lecture/
écriture" au sens de cette matrice (même exclusion que MODULES_NOTIFIABLES, mêmes raisons).

Pourquoi une constante Python et pas une table `Module` en base : `RoleModulePermission.module`
et `ModuleVisibiliteMembre.module` sont des `CharField` SANS `choices` figées en base (seulement
validés côté serializer contre cette liste) — ajouter un module à l'app ne demande donc AUCUNE
migration, juste une ligne ici (déjà l'étape obligatoire aujourd'hui pour toute nouvelle app, voir
LOCAL_APPS). Les endpoints `GET /rbac/matrix/` et `GET /rbac/visibilite-membre/` complètent à la
volée les lignes manquantes (valeur par défaut), donc un nouveau module apparaît immédiatement
comme colonne supplémentaire côté frontend, sans écriture DB ni action admin préalable — c'est ce
qui réalise l'exigence "la matrice doit s'étendre automatiquement".
"""

MODULES = [
    "membres",
    "cotisations",
    "adhesions",
    "evenements",
    "boutique",
    "vote",
    "communaute",
    "stats",
    "notifications",
    "projets",
]

# Libellés affichés côté matrice/visibilité — pas de fichier i18n dédié pour ce module interne
# Admin App uniquement (comme MODULES_NOTIFIABLES, jamais montré à un membre normal).
MODULE_LABELS = {
    "membres": "Membres",
    "cotisations": "Cotisations",
    "adhesions": "Adhésions",
    "evenements": "Événements",
    "boutique": "Boutique",
    "vote": "Vote",
    "communaute": "Communauté",
    "stats": "Statistiques",
    "notifications": "Notifications",
    "projets": "Projets",
}

# ---------------------------------------------------------------------------
# Clés de VISIBILITÉ DE MENU — une clé par ENTRÉE de la Sidebar (hors groupe "Administration",
# géré par la matrice des 14 pages de gestion ci-dessous).
#
# Historique : demande du 2026-10-05 (point 9) = 10 modules + "albums", ce qui regroupait toute la
# communauté (Fil, Forum, Messagerie, Gruppen, Fan-Club, Quiz) sous la seule clé "communaute" et le
# Covoiturage sous "evenements". Demande du 2026-10-11 : chaque entrée de menu se règle
# INDIVIDUELLEMENT (tableau "Sichtbarkeit" de la Rollenverwaltung). La clé de chaque entrée est
# donc désormais propre ; `MENU_PARENT_LEGACY` rattache les nouvelles clés à l'ancienne clé
# groupée dont elles héritent leur réglage lors de la migration de données (voir migration 0006).
#
# "Dashboard" et "Startseite" ne figurent pas ici : toujours visibles. "Mitglieder" (clé
# `membres`) reste réglable côté menu, mais l'API des membres se limite déjà elle-même à la fiche
# du compte pour un rôle < RH (MembreViewSet.get_queryset) — aucune barrière d'API supplémentaire.
MENU_ITEMS = [
    # (clé, libellé, groupe de la Sidebar, module de la matrice d'accès, pages de gestion liées)
    ("membres", "Mitglieder", "general", "membres", ()),
    ("adhesions", "Meine Mitgliedschaft", "general", "adhesions", ("page_campagnes_adhesion",)),
    (
        "evenements",
        "Veranstaltungen",
        "general",
        "evenements",
        ("page_events", "page_inscriptions"),
    ),
    ("covoiturage", "Fahrgemeinschaften", "general", "evenements", ("page_events",)),
    ("projets", "Aktionen & Projekte", "general", "projets", ("page_projets",)),
    ("boutique", "Shop", "general", "boutique", ("page_boutique",)),
    ("fil", "Neuigkeiten (Fil)", "communaute", "communaute", ()),
    ("forum", "Forum", "communaute", "communaute", ()),
    ("messagerie", "Nachrichten", "communaute", "communaute", ()),
    ("groupes", "Gruppen", "communaute", "communaute", ()),
    ("live", "Fan-Club (Live, Tabelle, Tippspiel)", "communaute", "communaute", ()),
    ("albums", "Fotoalben", "contenu", "communaute", ("page_albums",)),
    ("quiz", "Quiz", "contenu", "communaute", ("page_quiz",)),
    ("vote", "Abstimmungen", "contenu", "vote", ()),
]
MENU_KEYS = [cle for cle, *_ in MENU_ITEMS]
MENU_LABELS = {cle: libelle for cle, libelle, *_ in MENU_ITEMS}
MENU_GROUPE = {cle: groupe for cle, _l, groupe, *_ in MENU_ITEMS}
MENU_MODULE_MATRICE = {cle: module for cle, _l, _g, module, _p in MENU_ITEMS}
MENU_PAGES_ADMIN = {cle: pages for cle, _l, _g, _m, pages in MENU_ITEMS}

# Ancienne clé groupée dont chaque nouvelle clé hérite son réglage (migration 0006) — les clés
# sans entrée ici existaient déjà telles quelles.
MENU_PARENT_LEGACY = {
    "fil": "communaute",
    "forum": "communaute",
    "messagerie": "communaute",
    "groupes": "communaute",
    "live": "communaute",
    "quiz": "communaute",
    "covoiturage": "evenements",
}

VISIBILITE_KEYS = list(MENU_KEYS)
VISIBILITE_LABELS = dict(MENU_LABELS)

# Défaut "non-membre" (compte connecté sans fiche Membre ACTIVE) quand aucune ligne
# ModuleVisibiliteMembre n'existe, ou que sa colonne `visible_non_membre` est vide :
# Meine Mitgliedschaft, Veranstaltungen (+ Fahrgemeinschaften, comme avant la séparation des
# clés), Aktionen & Projekte, Shop, Fotoalben. Tout le reste est masqué ET refusé par l'API.
VISIBILITE_NON_MEMBRE_DEFAUT = {
    "adhesions",
    "evenements",
    "covoiturage",
    "projets",
    "boutique",
    "albums",
}

# Préfixes d'URL d'API -> clé de menu (barrière "non-membre", voir services.gate_nicht_mitglied).
# Le préfixe le PLUS LONG gagne. Un chemin absent de cette liste n'est jamais barré par ce
# mécanisme : auth, notifications, cotisations (paiements — chaque compte n'y voit que ses
# propres lignes), membres (scopé à soi-même sous RH), rbac, partenaires, traductions et les
# lectures PUBLIQUES de la Startseite (classement, calendrier, logos, configuration du site).
# Les pages de gestion (stats, finances, ...) se règlent séparément via la matrice des pages.
API_PREFIXES_MENU = [
    ("/api/v1/adhesions/", "adhesions"),
    ("/api/v1/evenements/covoiturages/", "covoiturage"),
    ("/api/v1/evenements/reservations-covoiturage/", "covoiturage"),
    ("/api/v1/evenements/", "evenements"),
    ("/api/v1/projets/", "projets"),
    ("/api/v1/boutique/", "boutique"),
    ("/api/v1/votes/", "vote"),
    ("/api/v1/communaute/publications/", "fil"),
    ("/api/v1/communaute/commentaires/", "fil"),
    ("/api/v1/communaute/sujets/", "forum"),
    ("/api/v1/communaute/reponses-forum/", "forum"),
    ("/api/v1/communaute/conversations/", "messagerie"),
    ("/api/v1/communaute/messages-prives/", "messagerie"),
    ("/api/v1/communaute/membres-recherche/", "messagerie"),
    ("/api/v1/communaute/groupes/", "groupes"),
    ("/api/v1/communaute/messages-groupe/", "groupes"),
    ("/api/v1/communaute/matchs/", "live"),
    ("/api/v1/communaute/match-commentaires/", "live"),
    ("/api/v1/communaute/match-evenements/", "live"),
    ("/api/v1/communaute/statistiques-joueurs/", "live"),
    ("/api/v1/communaute/tippspiel/", "live"),
    ("/api/v1/communaute/tippspiel-teilnahmen/", "live"),
    ("/api/v1/communaute/tippspiel-tipps/", "live"),
    ("/api/v1/communaute/albums/", "albums"),
    ("/api/v1/communaute/photos/", "albums"),
    ("/api/v1/communaute/photo-commentaires/", "albums"),
    ("/api/v1/communaute/quiz/", "quiz"),
    ("/api/v1/communaute/quiz-questions/", "quiz"),
    ("/api/v1/communaute/quiz-choix/", "quiz"),
]

# ---------------------------------------------------------------------------
# Pages de gestion (Phase D, ajoutée le 2026-09-23, demande utilisateur : "Ich möchte dass du
# alle Verwaltungsmodule zur Matrix hinzufügst [...] Es soll möglich sein Zugriff bei den
# Systemrollen auch umzustellen (Außer App Admin)") — liste EXPLICITE des 13 Admin-Unterseiten
# nommées par l'utilisateur (14 moins Rollenverwaltung, qui reste hors matrice, voir
# accounts.permissions/GestionRolesPage, décision confirmée : risque d'auto-escalade).
#
# Constante SÉPARÉE de MODULES (et non fusionnée dedans) pour deux raisons : (1) éviter toute
# collision de slug avec les 10 modules métier existants (ex. le module de données "stats" et la
# page de gestion "Statistiken & KPIs" sont deux concepts différents, d'où le préfixe `page_`) ;
# (2) la sémantique de niveau y est PARTIELLEMENT différente de celle des 10 modules de données —
# `lecture` donne accès en LECTURE SEULE à la page (voir chaque page/routing frontend), et
# `lecture_ecriture` est nécessaire pour les actions de modification (create/update/destroy...)
# au sein de la page — distinction réelle depuis le 2026-09-24 (retour utilisateur : une cellule
# "Lesen" seule permettait quand même de créer des quiz, voir apps.rbac.services.
# has_admin_page_access pour le détail). Certaines pages n'ont toutefois aucune notion d'écriture
# distincte (ex. `page_stats`, entièrement en lecture) — `lecture` et `lecture_ecriture` y sont
# alors équivalents en pratique, faute d'action de modification à gater.
PAGES_ADMIN = [
    "page_quiz",
    "page_boutique",
    "page_events",
    "page_stats",
    "page_inscriptions",
    "page_justificatifs",
    "page_campagnes_adhesion",
    "page_cotisations_attente",
    "page_cotisations_relances",
    "page_articles_cotisation",
    "page_notifications_params",
    "page_projets",
    "page_albums",
    "page_finances",
]

PAGE_ADMIN_LABELS = {
    "page_quiz": "Gestion des quiz",
    "page_boutique": "Gestion de la boutique",
    "page_events": "Gestion des événements",
    "page_stats": "Statistiques & KPIs",
    "page_inscriptions": "Validation des inscriptions",
    "page_justificatifs": "Justificatifs (file RH)",
    "page_campagnes_adhesion": "Campagnes d'adhésion",
    "page_cotisations_attente": "Paiements en attente",
    "page_cotisations_relances": "Échéances de relance",
    "page_articles_cotisation": "Catalogue d'articles de cotisation",
    "page_notifications_params": "Paramètres des e-mails de notification",
    "page_projets": "Gestion des projets & actions",
    "page_albums": "Gestion des albums photos",
    "page_finances": "Finances (dépenses, budget, bilan)",
}

# Vue combinée utilisée par la matrice (`GET /rbac/matrix/`) : une seule liste de colonnes pour
# le frontend, qui n'a donc rien à changer pour afficher les nouvelles pages automatiquement.
ALL_MODULES = MODULES + PAGES_ADMIN
ALL_MODULE_LABELS = {**MODULE_LABELS, **PAGE_ADMIN_LABELS}


def categorie_module(module: str) -> str:
    """ "page_admin" pour une des 13 pages de gestion, "donnees" pour un module métier — exposé
    à la matrice (`GET /rbac/matrix/`) pour que le frontend sache quelles colonnes verrouiller
    pour l'Administrateur App, sans avoir à recopier la liste PAGES_ADMIN côté TypeScript."""
    return "page_admin" if module in PAGES_ADMIN else "donnees"
