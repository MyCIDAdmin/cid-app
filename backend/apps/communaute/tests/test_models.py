import pytest

from apps.communaute.models import extraire_hashtags
from apps.communaute.tests.factories import (
    CommentaireFactory,
    PublicationFactory,
    ReponseForumFactory,
    SujetFactory,
)

pytestmark = pytest.mark.django_db


def test_extraire_hashtags_normalise_minuscule_et_dedoublonne():
    contenu = "Allez le #CA1920 !! On y croit #CA1920 #Ultras"
    assert extraire_hashtags(contenu) == ["ca1920", "ultras"]


def test_extraire_hashtags_liste_vide_si_aucun():
    assert extraire_hashtags("Texte sans hashtag.") == []


def test_synchroniser_hashtags_cree_et_lie_les_hashtags():
    publication = PublicationFactory(contenu="Superbe victoire #CA1920 #Berlin")
    publication.synchroniser_hashtags()
    labels = set(publication.hashtags.values_list("label", flat=True))
    assert labels == {"ca1920", "berlin"}


def test_synchroniser_hashtags_reappelee_retire_les_hashtags_disparus():
    publication = PublicationFactory(contenu="#Un #Deux")
    publication.synchroniser_hashtags()
    assert publication.hashtags.count() == 2

    publication.contenu = "Plus aucun hashtag ici."
    publication.save(update_fields=["contenu"])
    publication.synchroniser_hashtags()
    assert publication.hashtags.count() == 0


def test_nombre_reponses_dun_sujet_exclut_les_reponses_masquees():
    sujet = SujetFactory()
    ReponseForumFactory(sujet=sujet)
    ReponseForumFactory(sujet=sujet, est_masquee=True)
    assert sujet.nombre_reponses == 1


def test_commentaire_peut_avoir_un_parent_pour_former_une_reponse():
    commentaire = CommentaireFactory()
    reponse = CommentaireFactory(publication=commentaire.publication, parent=commentaire)
    assert reponse.parent_id == commentaire.id
    assert commentaire.reponses.count() == 1
