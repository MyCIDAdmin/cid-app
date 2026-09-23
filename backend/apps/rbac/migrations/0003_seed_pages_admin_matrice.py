# Migration de données — Phase D (ajoutée le 2026-09-23, "echte seitenspezifische
# Zugriffskontrolle für Verwaltungsseiten").
#
# Seed la matrice RoleModulePermission pour les 13 nouvelles pages de gestion
# (apps.rbac.registry.PAGES_ADMIN) — un enjeu différent de 0002_seed_roles_et_matrice : ici, à
# partir de cette migration, la matrice devient la SOURCE DE VÉRITÉ pour les 5 rôles système
# eux-mêmes sur ces 13 pages (voir apps.rbac.services.has_admin_page_access, qui n'exclut PAS le
# rôle système actuel, contrairement à is_elevated_for_module utilisé par le reste de la
# matrice). Les valeurs ci-dessous sont donc dérivées 1:1 des seuils ROLE_LEVELS déjà en vigueur
# aujourd'hui dans le code (voir le tableau du plan approuvé, section "Phase D (überarbeitet)")
# — au déploiement de cette migration, le comportement réel de chaque rôle système NE CHANGE PAS
# ; seule une modification ultérieure et explicite d'une cellule par un Administrateur App aura
# un effet.
#
# Administrateur App (super_admin) : les 13 cellules sont seedées à `lecture_ecriture` pour que
# la matrice AFFICHE correctement "accès total", mais c'est purement cosmétique —
# has_admin_page_access ignore le contenu de la matrice pour ce rôle (accès hartcodé), et
# RoleModuleMatrixSetView refuse même d'écrire une autre valeur pour lui sur ces pages.
from django.db import migrations

AUCUN, LECTURE_ECRITURE = "aucun", "lecture_ecriture"

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

# Seuil ROLE_LEVELS actuel par page — voir le tableau du plan (fichier permissions.py cité en
# commentaire pour audit facile).
SEUIL_PAR_PAGE = {
    "page_quiz": "bureau_admin",  # communaute/permissions.py::GestionQuizPermission
    "page_boutique": "bureau_admin",  # boutique/permissions.py::CatalogueBoutiquePermission
    "page_events": "bureau_admin",  # evenements/permissions.py::EvenementPermission
    "page_stats": "bureau_admin",  # stats/permissions.py::StatsPermission
    "page_inscriptions": "rh",  # accounts/permissions.py::IsRHOrAbove (PendingRegistrationsView)
    "page_justificatifs": "rh",  # adhesions/permissions.py::JustificatifPermission.RH_ONLY_ACTIONS
    "page_campagnes_adhesion": "bureau_admin",  # adhesions/permissions.py::CataloguePermission
    "page_cotisations_attente": "dir_financier",  # cotisations/views.py::marquer_payee
    "page_cotisations_relances": "dir_financier",  # cotisations/views.py::ConfigurationRelancePermission
    "page_articles_cotisation": "super_admin",  # cotisations/permissions.py::ArticleCataloguePermission
    "page_notifications_params": "super_admin",  # notifications/permissions.py::ParametresNotificationPermission
    "page_projets": "bureau_admin",  # projets/permissions.py::ProjetPermission
    "page_albums": "bureau_admin",  # communaute/permissions.py::AlbumPermission / PhotoPermission
}

# Même hiérarchie numérique que accounts.models.ROLE_LEVELS.
NIVEAU_ROLE = {
    "membre": 1,
    "rh": 2,
    "bureau_admin": 3,
    "dir_financier": 4,
    "super_admin": 5,
}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")

    for role_slug, niveau_role in NIVEAU_ROLE.items():
        role = RoleDefinition.objects.filter(slug=role_slug, is_system=True).first()
        if role is None:
            continue  # défensif — 0002 a déjà créé les 5 rôles système avant cette migration
        for page in PAGES_ADMIN:
            niveau_requis = NIVEAU_ROLE[SEUIL_PAR_PAGE[page]]
            valeur = LECTURE_ECRITURE if niveau_role >= niveau_requis else AUCUN
            RoleModulePermission.objects.get_or_create(
                role=role, module=page, defaults={"niveau_acces": valeur}
            )


def revenir_en_arriere(apps, schema_editor):
    # Pas de suppression automatique — même raisonnement que 0002_seed_roles_et_matrice : un
    # Administrateur App a pu modifier ces cellules entre-temps, un rollback destructif serait
    # plus dangereux qu'utile.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("rbac", "0002_seed_roles_et_matrice"),
    ]

    operations = [
        migrations.RunPython(seed, revenir_en_arriere),
    ]
