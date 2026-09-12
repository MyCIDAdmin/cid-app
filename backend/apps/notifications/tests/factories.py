import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import Role, User
from apps.notifications.models import Notification, TypeNotification


class UserFactory(DjangoModelFactory):
    """Petite factory locale — les autres apps utilisent `User.objects.create_user(...)`
    directement dans leurs tests plutôt qu'une factory, mais ce module n'a pas de Membre associé
    à créer à chaque fois (un destinataire de notification est un User nu)."""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    email = factory.Sequence(lambda n: f"user{n}@example.de")
    role = Role.MEMBRE
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, **kwargs)


class NotificationFactory(DjangoModelFactory):
    class Meta:
        model = Notification

    destinataire = factory.SubFactory(UserFactory)
    type_notification = TypeNotification.BIENVENUE
    titre = "Bienvenue"
    message = "Votre compte est actif."
    lien = ""
    lu = False
