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
