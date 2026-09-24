import pytest
from django.db import IntegrityError

from apps.communaute.models import Conversation, extraire_hashtags
from apps.communaute.tests.factories import (
    AlbumFactory,
    ChoixQuestionFactory,
    ClassementLigueFactory,
    CommentaireFactory,
    ConversationFactory,
    GroupeChatFactory,
    MatchCommentaireFactory,
    MatchEvenementFactory,
    MatchFactory,
    MatchReactionFactory,
    MembreGroupeFactory,
    MessageGroupeFactory,
    MessagePriveFactory,
    ParticipationQuizFactory,
    PhotoCommentaireFactory,
    PhotoFactory,
    PhotoLikeFactory,
    PublicationFactory,
    QuestionQuizFactory,
    QuizFactory,
    RencontreCalendrierFactory,
    ReponseForumFactory,
    ReponseQuizFactory,
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


# ---------------------------------------------------------------------------
# Live Match, Albums, Quiz (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------


def test_match_commentaire_ordre_chronologique():
    match = MatchFactory()
    premier = MatchCommentaireFactory(match=match, contenu="Premier")
    second = MatchCommentaireFactory(match=match, contenu="Second")
    ids = list(match.commentaires.values_list("id", flat=True))
    assert ids == [premier.id, second.id]


def test_match_reaction_sans_contrainte_dunicite_chaque_frappe_est_une_ligne():
    # Voir docstring de tête models.py — pas de bascule comme un like, chaque clic compte.
    match = MatchFactory()
    membre = MembreFactory()
    MatchReactionFactory(match=match, membre=membre)
    MatchReactionFactory(match=match, membre=membre)
    assert match.reactions.filter(membre=membre).count() == 2


def test_album_nombre_photos_exclut_les_masquees():
    album = AlbumFactory()
    PhotoFactory(album=album)
    PhotoFactory(album=album, est_masquee=True)
    assert album.nombre_photos == 1


def test_album_date_et_lieu_optionnels():
    # date/lieu (ajoutés le 2026-09-22, "Analog zum Modul Projekte eine Beschreibung zu
    # erfassen, das Datum und den Ort") : saisie libre, jamais requise — un album créé sans
    # les renseigner doit rester valide (voir docstring de classe Album).
    album_sans = AlbumFactory()
    assert album_sans.date is None
    assert album_sans.lieu == ""

    album_avec = AlbumFactory(date="2026-10-03", lieu="Berlin")
    assert str(album_avec.date) == "2026-10-03"
    assert album_avec.lieu == "Berlin"


def test_photo_like_unicite():
    photo = PhotoFactory()
    membre = MembreFactory()
    PhotoLikeFactory(photo=photo, membre=membre)
    with pytest.raises(IntegrityError):
        PhotoLikeFactory(photo=photo, membre=membre)


def test_photo_commentaire_ordre_chronologique():
    photo = PhotoFactory()
    premier = PhotoCommentaireFactory(photo=photo, contenu="Premier")
    second = PhotoCommentaireFactory(photo=photo, contenu="Second")
    ids = list(photo.commentaires.values_list("id", flat=True))
    assert ids == [premier.id, second.id]


def test_choix_question_est_correct_non_expose_par_defaut_au_niveau_modele():
    # Le modèle lui-même n'a pas de logique de masquage (c'est le serializer qui s'en
    # charge, voir test_api.py) — ce test vérifie juste que le champ est bien persistant.
    choix = ChoixQuestionFactory(est_correct=True)
    choix.refresh_from_db()
    assert choix.est_correct is True


def test_participation_quiz_unicite_par_quiz_et_membre():
    quiz = QuizFactory()
    membre = MembreFactory()
    ParticipationQuizFactory(quiz=quiz, membre=membre)
    with pytest.raises(IntegrityError):
        ParticipationQuizFactory(quiz=quiz, membre=membre)


def test_reponse_quiz_unicite_par_participation_et_question():
    participation = ParticipationQuizFactory()
    question = QuestionQuizFactory(quiz=participation.quiz)
    choix = ChoixQuestionFactory(question=question)
    ReponseQuizFactory(participation=participation, question=question, choix=choix)
    with pytest.raises(IntegrityError):
        ReponseQuizFactory(participation=participation, question=question, choix=choix)


def test_participation_quiz_temps_total_secondes_none_si_pas_terminee():
    participation = ParticipationQuizFactory()
    assert participation.temps_total_secondes is None


def test_participation_quiz_temps_total_secondes_calcule_une_fois_terminee():
    from datetime import timedelta

    from django.utils import timezone

    participation = ParticipationQuizFactory()
    participation.terminee_le = participation.demarree_le + timedelta(seconds=42)
    participation.save(update_fields=["terminee_le"])
    assert participation.temps_total_secondes == pytest.approx(42, abs=1)
    # `timezone.now()` importé ici uniquement pour rendre explicite que `terminee_le` est
    # bien un datetime aware (cohérence de fuseau horaire, USE_TZ=True) — pas utilisé au-delà.
    assert timezone.is_aware(participation.terminee_le)


# ---------------------------------------------------------------------------
# Fan-Club — extension du Live Match (2026-09-24)
# ---------------------------------------------------------------------------


def test_classement_ligue_unicite_par_saison_et_equipe():
    ClassementLigueFactory(saison="2025-2026", equipe="Club Africain")
    with pytest.raises(IntegrityError):
        ClassementLigueFactory(saison="2025-2026", equipe="Club Africain")


def test_classement_ligue_meme_equipe_saisons_differentes_autorise():
    ClassementLigueFactory(saison="2024-2025", equipe="Club Africain")
    # Ne doit pas lever — l'unicité porte sur (saison, equipe), pas sur equipe seule.
    ClassementLigueFactory(saison="2025-2026", equipe="Club Africain")
    assert ClassementLigueFactory._meta.model.objects.filter(equipe="Club Africain").count() == 2


def test_rencontre_calendrier_evenement_externe_id_unique():
    RencontreCalendrierFactory(evenement_externe_id="evt-1")
    with pytest.raises(IntegrityError):
        RencontreCalendrierFactory(evenement_externe_id="evt-1")


def test_rencontre_calendrier_est_a_venir():
    from datetime import timedelta

    from django.utils import timezone

    future = RencontreCalendrierFactory(date_heure=timezone.now() + timedelta(days=5))
    passee = RencontreCalendrierFactory(date_heure=timezone.now() - timedelta(days=5))
    assert future.est_a_venir is True
    assert passee.est_a_venir is False


def test_match_evenement_ordre_par_minute():
    match = MatchFactory()
    second = MatchEvenementFactory(match=match, minute=60)
    premier = MatchEvenementFactory(match=match, minute=10)
    ids = list(match.evenements.values_list("id", flat=True))
    assert ids == [premier.id, second.id]
