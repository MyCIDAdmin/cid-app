import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import Role, User

from apps.rbac.models import ModuleVisibiliteMembre, NiveauAcces, RoleDefinition, RoleModulePermission, UserRoleAssignment


class UserFactory(DjangoModelFactory):
    """Même convention que apps.notifications.tests.factories.UserFactory — un User nu, sans
    profil Membre associé, suffit pour les tests de ce module (rôles/permissions uniquement)."""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    email = factory.Sequence(lambda n: f"rbac-user{n}@example.de")
    role = Role.MEMBRE
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, **kwargs)


class RoleDefinitionFactory(DjangoModelFactory):
    """Un rôle personnalisé par défaut (`is_system=False`) — les 5 rôles système ne sont jamais
    créés via cette factory, ils viennent exclusivement de la migration de données 0002 (déjà
    présents dans la base de test, migrations non désactivées, voir pytest.ini)."""

    class Meta:
        model = RoleDefinition

    slug = factory.Sequence(lambda n: f"role-perso-{n}")
    nom = factory.Sequence(lambda n: f"Rôle personnalisé {n}")
    description = ""
    is_system = False
    ordre = 0
    actif = True


class UserRoleAssignmentFactory(DjangoModelFactory):
    class Meta:
        model = UserRoleAssignment

    user = factory.SubFactory(UserFactory)
    role = factory.SubFactory(RoleDefinitionFactory)
    assigned_by = None


class RoleModulePermissionFactory(DjangoModelFactory):
    class Meta:
        model = RoleModulePermission

    role = factory.SubFactory(RoleDefinitionFactory)
    module = "membres"
    niveau_acces = NiveauAcces.LECTURE


class ModuleVisibiliteMembreFactory(DjangoModelFactory):
    class Meta:
        model = ModuleVisibiliteMembre
        django_get_or_create = ("module",)

    module = "membres"
    visible = True
