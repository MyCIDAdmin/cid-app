import itertools

import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import Role, User
from apps.communaute.models import (
    CategorieForum,
    Commentaire,
    Conversation,
    GroupeChat,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    Publication,
    ReponseForum,
    Sujet,
    TypeGroupe,
)
from apps.membres.tests.factories import MembreFactory

_membre_seq = itertools.count()


def user_membre_avec_fiche(email=None, **membre_kwargs):
    """Même convention que apps.vote.tests.factories.user_membre_avec_fiche — utilisé par
    les tests WebSocket (Messagerie/Groupes), qui ont besoin d'un User authentifiable ET
    de sa fiche Membre (le consumer travaille sur `user.membre`, pas `user` seul)."""
    email = email or f"membre{next(_membre_seq)}@example.de"
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


class PublicationFactory(DjangoModelFactory):
    class Meta:
        model = Publication

    auteur = factory.SubFactory(MembreFactory)
    contenu = factory.Sequence(lambda n: f"Publication de test numéro {n}")


class CommentaireFactory(DjangoModelFactory):
    class Meta:
        model = Commentaire

    publication = factory.SubFactory(PublicationFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Commentaire de test."


class SujetFactory(DjangoModelFactory):
    class Meta:
        model = Sujet

    auteur = factory.SubFactory(MembreFactory)
    categorie = CategorieForum.GENERAL
    titre = factory.Sequence(lambda n: f"Sujet de test {n}")
    contenu = "Contenu du sujet de test."


class ReponseForumFactory(DjangoModelFactory):
    class Meta:
        model = ReponseForum

    sujet = factory.SubFactory(SujetFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Réponse de test."


class ConversationFactory(DjangoModelFactory):
    class Meta:
        model = Conversation

    membre_a = factory.SubFactory(MembreFactory)
    membre_b = factory.SubFactory(MembreFactory)


class MessagePriveFactory(DjangoModelFactory):
    class Meta:
        model = MessagePrive

    conversation = factory.SubFactory(ConversationFactory)
    expediteur = factory.SubFactory(MembreFactory)
    contenu = "Message privé de test."


class GroupeChatFactory(DjangoModelFactory):
    class Meta:
        model = GroupeChat

    nom = factory.Sequence(lambda n: f"Groupe de test {n}")
    description = "Description du groupe de test."
    type_groupe = TypeGroupe.PUBLIC
    createur = factory.SubFactory(MembreFactory)


class MembreGroupeFactory(DjangoModelFactory):
    class Meta:
        model = MembreGroupe

    groupe = factory.SubFactory(GroupeChatFactory)
    membre = factory.SubFactory(MembreFactory)


class MessageGroupeFactory(DjangoModelFactory):
    class Meta:
        model = MessageGroupe

    groupe = factory.SubFactory(GroupeChatFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Message de groupe de test."
