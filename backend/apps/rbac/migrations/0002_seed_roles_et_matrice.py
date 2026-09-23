# Migration de données — seed initial (ajouté le 2026-09-23).
#
# 1. Crée les 5 RoleDefinition système, miroir exact de accounts.models.Role (slug/nom).
# 2. Seed la matrice RoleModulePermission à partir des seuils DÉJÀ EN VIGUEUR aujourd'hui dans
#    chaque apps/<module>/permissions.py — cette matrice ne peut donc jamais être plus
#    restrictive que le comportement actuel : elle n'ouvre qu'une porte SUPPLÉMENTAIRE (utilisée
#    à partir de la Phase B pour les rôles personnalisés), jamais retirer un accès déjà accordé
#    par le code bespoke existant, qui reste la source de vérité pour les 5 rôles système.
# 3. Rattache chaque User existant à sa rôle actuel (CharField `role`) via UserRoleAssignment —
#    un seul rôle initial par compte, cohérent avec le système à rôle unique d'aujourd'hui.
# 4. Seed ModuleVisibiliteMembre : tous les modules visibles par défaut (comportement actuel
#    inchangé tant que l'Admin App ne masque rien explicitement).
from django.db import migrations

# (slug, nom, ordre) — miroir exact de accounts.models.Role/ROLE_LEVELS.
ROLES_SYSTEME = [
    ("membre", "Membre Normal", 1),
    ("rh", "Ressources Humaines", 2),
    ("bureau_admin", "Membre Bureau Administratif", 3),
    ("dir_financier", "Directeur Financier", 4),
    ("super_admin", "Administrateur App", 5),
]

MODULES = [
    "membres", "cotisations", "adhesions", "evenements", "boutique",
    "vote", "communaute", "stats", "notifications", "projets",
]

AUCUN, LECTURE, LECTURE_ECRITURE = "aucun", "lecture", "lecture_ecriture"

# Matrice dérivée des seuils actuels par app (voir docstring de tête + le plan approuvé) —
# valeur par défaut "aucun" pour toute case non listée ci-dessous.
MATRICE_PAR_DEFAUT = {
    "membre": {
        "membres": LECTURE_ECRITURE, "cotisations": LECTURE_ECRITURE,
        "adhesions": LECTURE_ECRITURE, "evenements": LECTURE_ECRITURE,
        "boutique": LECTURE_ECRITURE, "vote": LECTURE, "communaute": LECTURE_ECRITURE,
        "notifications": LECTURE_ECRITURE, "projets": LECTURE, "stats": AUCUN,
    },
    "rh": {
        "membres": LECTURE_ECRITURE, "cotisations": LECTURE_ECRITURE,
        "adhesions": LECTURE_ECRITURE, "evenements": LECTURE_ECRITURE,
        "boutique": LECTURE_ECRITURE, "vote": LECTURE, "communaute": LECTURE_ECRITURE,
        "notifications": LECTURE_ECRITURE, "projets": LECTURE, "stats": AUCUN,
    },
    "bureau_admin": {
        "membres": LECTURE_ECRITURE, "cotisations": LECTURE_ECRITURE,
        "adhesions": LECTURE_ECRITURE, "evenements": LECTURE_ECRITURE,
        "boutique": LECTURE_ECRITURE, "vote": LECTURE_ECRITURE, "communaute": LECTURE_ECRITURE,
        "notifications": LECTURE_ECRITURE, "projets": LECTURE_ECRITURE, "stats": LECTURE,
    },
    "dir_financier": {
        "membres": LECTURE_ECRITURE, "cotisations": LECTURE_ECRITURE,
        "adhesions": LECTURE_ECRITURE, "evenements": LECTURE_ECRITURE,
        "boutique": LECTURE_ECRITURE, "vote": LECTURE_ECRITURE, "communaute": LECTURE_ECRITURE,
        "notifications": LECTURE_ECRITURE, "projets": LECTURE_ECRITURE, "stats": LECTURE,
    },
    "super_admin": {module: LECTURE_ECRITURE for module in MODULES},
}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    UserRoleAssignment = apps.get_model("rbac", "UserRoleAssignment")
    ModuleVisibiliteMembre = apps.get_model("rbac", "ModuleVisibiliteMembre")
    User = apps.get_model("accounts", "User")

    roles_par_slug = {}
    for slug, nom, ordre in ROLES_SYSTEME:
        role, _created = RoleDefinition.objects.get_or_create(
            slug=slug, defaults={"nom": nom, "is_system": True, "ordre": ordre}
        )
        roles_par_slug[slug] = role

    for slug, acces_par_module in MATRICE_PAR_DEFAUT.items():
        role = roles_par_slug[slug]
        for module in MODULES:
            RoleModulePermission.objects.get_or_create(
                role=role,
                module=module,
                defaults={"niveau_acces": acces_par_module.get(module, AUCUN)},
            )

    for user in User.objects.all():
        role = roles_par_slug.get(user.role)
        if role is not None:
            UserRoleAssignment.objects.get_or_create(user=user, role=role)

    for module in MODULES:
        ModuleVisibiliteMembre.objects.get_or_create(module=module, defaults={"visible": True})


def revenir_en_arriere(apps, schema_editor):
    # Pas de suppression automatique : un rôle système ou une attribution pourrait déjà avoir
    # été référencée par des actions admin ultérieures — un retour en arrière destructif serait
    # plus dangereux qu'utile ici. Un rollback de schéma seul (0001) suffit en pratique.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("rbac", "0001_initial"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, revenir_en_arriere),
    ]
