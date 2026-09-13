import factory
from factory.django import DjangoModelFactory

from apps.communaute.models import CategorieForum, Commentaire, Publication, ReponseForum, Sujet
from apps.membres.tests.factories import MembreFactory


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
