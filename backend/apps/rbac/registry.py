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
