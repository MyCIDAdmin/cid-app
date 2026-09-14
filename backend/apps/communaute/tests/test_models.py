import pytest
from django.db import IntegrityError

from apps.communaute.models import Conversation, extraire_hashtags
from apps.communaute.tests.factories import (
    CommentaireFactory,
    ConversationFactory,
    GroupeChatFactory,
    MembreGroupeFactory,
    MessageGroupeFactory,
    MessagePriveFactory,
    PublicationFactory,
    ReponseForumFactory,
    SujetFactory,
)
from apps.membres.tests.factories import MembreFactory

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


# --- Messagerie privée + Groupes de chat ---


def test_get_or_create_entre_canonicalise_la_paire_quel_que_soit_linitiateur():
    m1 = MembreFactory()
    m2 = MembreFactory()

    conv_a = Conversation.get_or_create_entre(m1, m2)
    conv_b = Conversation.get_or_create_entre(m2, m1)

    assert conv_a.id == conv_b.id
    assert Conversation.objects.count() == 1


def test_conversation_paire_unique_empeche_le_doublon_direct():
    m1 = MembreFactory()
    m2 = MembreFactory()
    ConversationFactory(membre_a=m1, membre_b=m2)
    with pytest.raises(IntegrityError):
        ConversationFactory(membre_a=m1, membre_b=m2)


def test_conversation_participant_et_autre_participant():
    m1 = MembreFactory()
    m2 = MembreFactory()
    m3 = MembreFactory()
    conversation = Conversation.get_or_create_entre(m1, m2)

    assert conversation.participant(m1) is True
    assert conversation.participant(m3) is False
    assert conversation.autre_participant(m1).id == m2.id
    assert conversation.autre_participant(m2).id == m1.id


def test_message_prive_contenu_est_chiffre_en_base():
    message = MessagePriveFactory(contenu="Salut, ça va ?")
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT contenu FROM communaute_messages_prives WHERE id = %s", [str(message.id)]
        )
        (valeur_brute,) = cursor.fetchone()

    assert valeur_brute != "Salut, ça va ?"
    message.refresh_from_db()
    assert message.contenu == "Salut, ça va ?"


def test_groupe_chat_membre_groupe_unicite():
    groupe = GroupeChatFactory()
    membre = MembreFactory()
    MembreGroupeFactory(groupe=groupe, membre=membre)
    with pytest.raises(IntegrityError):
        MembreGroupeFactory(groupe=groupe, membre=membre)


def test_message_groupe_ordre_chronologique():
    groupe = GroupeChatFactory()
    premier = MessageGroupeFactory(groupe=groupe, contenu="Premier")
    second = MessageGroupeFactory(groupe=groupe, contenu="Second")
    ids = list(groupe.messages.values_list("id", flat=True))
    assert ids == [premier.id, second.id]
