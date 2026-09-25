"""Tests API — app communaute, tous les lots (Fil d'actualité + Forum ; Messagerie +
Groupes ; Live Match + Albums + Quiz — Phase 4B, CID-SCD-001 §résumé "Forum / Fil — RBAC")."""

import io
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute import services
from apps.communaute.models import (
    CategorieForum,
    Commentaire,
    Conversation,
    EquipeInfo,
    MembreGroupe,
    MessageGroupe,
    MessageGroupeLike,
    MessagePriveLike,
    Photo,
)
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
    PhotoFactory,
    PublicationFactory,
    QuestionQuizFactory,
    QuizFactory,
    RencontreCalendrierFactory,
    ReponseForumFactory,
    StatistiqueJoueurFactory,
    SujetFactory,
)
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


PUBLICATION_LIST_URL = "communaute:publication-list"
SUJET_LIST_URL = "communaute:sujet-list"


def _publication_detail_url(publication):
    return reverse("communaute:publication-detail", args=[publication.id])


def _liker_url(publication):
    return reverse("communaute:publication-liker", args=[publication.id])


def _partager_url(publication):
    return reverse("communaute:publication-partager", args=[publication.id])


def _masquer_publication_url(publication):
    return reverse("communaute:publication-masquer", args=[publication.id])


def _sujet_detail_url(sujet):
    return reverse("communaute:sujet-detail", args=[sujet.id])


def _epingler_url(sujet):
    return reverse("communaute:sujet-epingler", args=[sujet.id])


def _verrouiller_url(sujet):
    return reverse("communaute:sujet-verrouiller", args=[sujet.id])


def _masquer_sujet_url(sujet):
    return reverse("communaute:sujet-masquer", args=[sujet.id])


# --- Fil d'actualité : visibilité et permissions ---


def test_list_publications_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(PUBLICATION_LIST_URL))
    assert resp.status_code == 401


def test_membre_normal_ne_voit_pas_les_publications_masquees(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m1@example.de")
    PublicationFactory(est_masquee=True, contenu="Publication masquée")
    PublicationFactory(contenu="Publication visible")
    resp = _auth(api_client, user).get(reverse(PUBLICATION_LIST_URL))
    assert resp.status_code == 200
    contenus = [p["contenu"] for p in resp.data["results"]]
    assert "Publication masquée" not in contenus
    assert "Publication visible" in contenus


def test_bureau_admin_voit_les_publications_masquees(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin1@example.de")
    PublicationFactory(est_masquee=True, contenu="Publication masquée")
    resp = _auth(api_client, user).get(reverse(PUBLICATION_LIST_URL))
    assert resp.status_code == 200
    contenus = [p["contenu"] for p in resp.data["results"]]
    assert "Publication masquée" in contenus


def test_membre_peut_creer_une_publication_avec_hashtags(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m2@example.de")
    resp = _auth(api_client, user).post(
        reverse(PUBLICATION_LIST_URL), {"contenu": "Allez le #CA1920 !"}
    )
    assert resp.status_code == 201
    assert resp.data["hashtags"] == ["ca1920"]
    assert resp.data["auteur"]["id"] == str(membre.id)


# --- Pièces jointes (image/document) — ajoutées le 2026-09-20, retour utilisateur :
# "Hochladen von pdf Dokumenten" + "wenn ich ein Bild an einer Neuigkeit anhänge, wird das
# Bild nach dem Veröffentlichen nicht angezeigt". Voir _image_valide plus bas dans ce fichier
# (module Albums) — même fonction, réutilisée ici — et PublicationSerializer.validate_image/
# validate_document (apps/communaute/serializers.py).


def _pdf_valide(nom="document.pdf"):
    # En-tête %PDF- minimal — suffisant pour la détection MIME réelle par magic bytes
    # (libmagic ne valide pas la structure PDF complète, seulement la signature de fichier),
    # même principe que _image_valide ci-dessous pour un JPEG minimal.
    contenu = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>"
    return SimpleUploadedFile(nom, contenu, content_type="application/pdf")


def test_creer_publication_avec_image_valide_est_reencodee_et_saffiche(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "img1@example.de")
    resp = _auth(api_client, user).post(
        reverse(PUBLICATION_LIST_URL),
        {"contenu": "Belle photo du match", "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["image"]
    # Nom de fichier reconstruit côté serveur (jamais "photo.jpg" du client) — voir
    # valider_et_reencoder_photo.
    assert "photo.jpg" not in resp.data["image"]


def test_creer_publication_avec_image_invalide_rejette(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "img2@example.de")
    faux_fichier = SimpleUploadedFile("photo.jpg", b"ceci n'est pas une image", "image/jpeg")
    resp = _auth(api_client, user).post(
        reverse(PUBLICATION_LIST_URL),
        {"contenu": "Belle photo du match", "image": faux_fichier},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "image" in resp.data["details"]


def test_creer_publication_avec_document_pdf_valide(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "doc1@example.de")
    resp = _auth(api_client, user).post(
        reverse(PUBLICATION_LIST_URL),
        {"contenu": "Le compte-rendu de l'AG", "document": _pdf_valide()},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["document"]
    assert resp.data["document"].endswith(".pdf")


def test_creer_publication_avec_document_non_pdf_rejette(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "doc2@example.de")
    faux_fichier = SimpleUploadedFile(
        "document.pdf", b"ceci n'est pas un pdf", content_type="application/pdf"
    )
    resp = _auth(api_client, user).post(
        reverse(PUBLICATION_LIST_URL),
        {"contenu": "Le compte-rendu de l'AG", "document": faux_fichier},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "document" in resp.data["details"]


def test_membre_normal_ne_peut_pas_masquer_la_publication_dautrui(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m3@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).post(_masquer_publication_url(publication), {"motif": "spam"})
    assert resp.status_code == 403


def test_bureau_admin_peut_masquer_une_publication_et_ca_est_journalise(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin2@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).post(_masquer_publication_url(publication), {"motif": "spam"})
    assert resp.status_code == 200
    publication.refresh_from_db()
    assert publication.est_masquee is True
    assert publication.motif_masquage == "spam"


def test_bureau_admin_peut_supprimer_la_publication_dautrui(api_client):
    # Demande utilisateur du 2026-09-16 ("Fil d'actualité : Posts müssen vom Admin
    # Verwaltbar werden sein [Gelöscht/Archiviert]") — ContenuCommunautePermission
    # l'autorisait déjà côté backend (voir has_object_permission), seul le bouton manquait
    # côté frontend (FilPage.tsx) : ce test couvre le comportement backend déjà en place.
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin2b@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).delete(_publication_detail_url(publication))
    assert resp.status_code == 204


def test_membre_normal_ne_peut_pas_supprimer_la_publication_dautrui(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m3b@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).delete(_publication_detail_url(publication))
    assert resp.status_code == 403


def test_auteur_peut_modifier_sa_propre_publication(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m4@example.de")
    publication = PublicationFactory(auteur=membre, contenu="Version initiale")
    resp = _auth(api_client, user).patch(
        _publication_detail_url(publication), {"contenu": "Version corrigée"}
    )
    assert resp.status_code == 200
    assert resp.data["contenu"] == "Version corrigée"


def test_est_auteur_reflete_le_membre_courant(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m4b@example.de")
    mienne = PublicationFactory(auteur=membre)
    dautrui = PublicationFactory()
    resp = _auth(api_client, user).get(reverse(PUBLICATION_LIST_URL))
    par_id = {p["id"]: p["est_auteur"] for p in resp.data["results"]}
    assert par_id[str(mienne.id)] is True
    assert par_id[str(dautrui.id)] is False


def test_membre_ne_peut_pas_modifier_la_publication_dautrui(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m5@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).patch(_publication_detail_url(publication), {"contenu": "hack"})
    assert resp.status_code == 403


# --- Like / Partage (bascule) ---


def test_liker_bascule_le_like(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m6@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).post(_liker_url(publication))
    assert resp.status_code == 200
    assert resp.data["nombre_likes"] == 1
    assert resp.data["jaime"] is True

    resp = api_client.post(_liker_url(publication))
    assert resp.data["nombre_likes"] == 0
    assert resp.data["jaime"] is False


def test_partager_bascule_le_partage(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m7@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).post(_partager_url(publication))
    assert resp.status_code == 200
    assert resp.data["nombre_partages"] == 1
    assert resp.data["jai_partage"] is True


# --- Commentaires (+ réponse à un commentaire) ---


def test_commenter_une_publication(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m8@example.de")
    publication = PublicationFactory()
    resp = _auth(api_client, user).post(
        reverse("communaute:commentaire-list"),
        {"publication": str(publication.id), "contenu": "Bravo !"},
    )
    assert resp.status_code == 201
    assert resp.data["auteur"]["id"] == str(membre.id)
    assert Commentaire.objects.filter(publication=publication).count() == 1


def test_repondre_a_un_commentaire_apparait_dans_le_serializer_de_publication(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m9@example.de")
    commentaire = CommentaireFactory()
    resp = _auth(api_client, user).post(
        reverse("communaute:commentaire-list"),
        {
            "publication": str(commentaire.publication.id),
            "parent": str(commentaire.id),
            "contenu": "Merci !",
        },
    )
    assert resp.status_code == 201

    detail = api_client.get(_publication_detail_url(commentaire.publication))
    racine = detail.data["commentaires"][0]
    assert racine["id"] == str(commentaire.id)
    assert len(racine["reponses"]) == 1
    assert racine["reponses"][0]["contenu"] == "Merci !"


def test_commenter_notifie_lauteur_de_la_publication(api_client):
    """Ajouté le 2026-09-16 (retour utilisateur : couverture "Messaging und Austausch
    Module") — voir notifications.notifier_nouveau_commentaire_fil."""
    user, _ = _user_avec_membre(Role.MEMBRE, "m8b@example.de")
    auteur_user, auteur_membre = _user_avec_membre(Role.MEMBRE, "auteur-fil@example.de")
    publication = PublicationFactory(auteur=auteur_membre)

    resp = _auth(api_client, user).post(
        reverse("communaute:commentaire-list"),
        {"publication": str(publication.id), "contenu": "Bravo !"},
    )

    assert resp.status_code == 201
    notification = Notification.objects.get(destinataire=auteur_user)
    assert notification.type_notification == TypeNotification.COMMUNAUTE_COMMENTAIRE_FIL
    assert notification.lien == f"/fil?publication={publication.id}"


def test_commenter_sa_propre_publication_ne_se_notifie_pas_soi_meme(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m8c@example.de")
    publication = PublicationFactory(auteur=membre)

    resp = _auth(api_client, user).post(
        reverse("communaute:commentaire-list"),
        {"publication": str(publication.id), "contenu": "Note perso"},
    )

    assert resp.status_code == 201
    assert not Notification.objects.filter(
        type_notification=TypeNotification.COMMUNAUTE_COMMENTAIRE_FIL
    ).exists()


def test_repondre_a_un_commentaire_notifie_aussi_son_auteur(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m9b@example.de")
    auteur_pub_user, auteur_pub = _user_avec_membre(Role.MEMBRE, "auteur-pub@example.de")
    auteur_parent_user, auteur_parent = _user_avec_membre(Role.MEMBRE, "auteur-parent@example.de")
    publication = PublicationFactory(auteur=auteur_pub)
    commentaire = CommentaireFactory(publication=publication, auteur=auteur_parent)

    resp = _auth(api_client, user).post(
        reverse("communaute:commentaire-list"),
        {
            "publication": str(publication.id),
            "parent": str(commentaire.id),
            "contenu": "Merci !",
        },
    )

    assert resp.status_code == 201
    for destinataire in (auteur_pub_user, auteur_parent_user):
        assert Notification.objects.filter(
            destinataire=destinataire,
            type_notification=TypeNotification.COMMUNAUTE_COMMENTAIRE_FIL,
        ).exists()


def test_auteur_du_commentaire_peut_le_supprimer(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m10@example.de")
    commentaire = CommentaireFactory(auteur=membre)
    resp = _auth(api_client, user).delete(
        reverse("communaute:commentaire-detail", args=[commentaire.id])
    )
    assert resp.status_code == 204
    assert not Commentaire.objects.filter(id=commentaire.id).exists()


# --- Forum : catégories, épinglage, verrouillage, modération ---


def test_creer_un_sujet_dans_chaque_categorie_valide(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m11@example.de")
    for categorie in CategorieForum.values:
        resp = _auth(api_client, user).post(
            reverse(SUJET_LIST_URL),
            {"categorie": categorie, "titre": f"Sujet {categorie}", "contenu": "Contenu."},
        )
        assert resp.status_code == 201, resp.data


def test_categorie_invalide_refusee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m12@example.de")
    resp = _auth(api_client, user).post(
        reverse(SUJET_LIST_URL),
        {"categorie": "culture_loisirs", "titre": "Sujet", "contenu": "Contenu."},
    )
    assert resp.status_code == 400


def test_liste_des_sujets_epingle_les_sujets_epingles_en_tete(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m13@example.de")
    SujetFactory(titre="Normal")
    SujetFactory(titre="Épinglé", est_epingle=True)
    resp = _auth(api_client, user).get(reverse(SUJET_LIST_URL))
    titres = [s["titre"] for s in resp.data["results"]]
    assert titres[0] == "Épinglé"


def test_epingler_bascule_et_reserve_au_bureau_admin(api_client):
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "m14@example.de")
    sujet = SujetFactory()
    resp = _auth(api_client, membre_user).post(_epingler_url(sujet))
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin3@example.de")
    resp = _auth(api_client, admin_user).post(_epingler_url(sujet))
    assert resp.status_code == 200
    sujet.refresh_from_db()
    assert sujet.est_epingle is True


def test_sujet_verrouille_bloque_les_nouvelles_reponses(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin4@example.de")
    sujet = SujetFactory()
    _auth(api_client, admin_user).post(_verrouiller_url(sujet))
    sujet.refresh_from_db()
    assert sujet.est_verrouille is True

    autre_user, _ = _user_avec_membre(Role.MEMBRE, "m15@example.de")
    resp = _auth(api_client, autre_user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Je réponds quand même"},
    )
    assert resp.status_code == 403


def test_masquer_un_sujet_le_retire_de_la_liste_pour_un_membre_normal(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin5@example.de")
    sujet = SujetFactory(titre="À modérer")
    resp = _auth(api_client, admin_user).post(_masquer_sujet_url(sujet), {"motif": "hors sujet"})
    assert resp.status_code == 200

    membre_user, _ = _user_avec_membre(Role.MEMBRE, "m16@example.de")
    resp = _auth(api_client, membre_user).get(reverse(SUJET_LIST_URL))
    titres = [s["titre"] for s in resp.data["results"]]
    assert "À modérer" not in titres


def test_repondre_a_un_sujet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m17@example.de")
    sujet = SujetFactory()
    resp = _auth(api_client, user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Réponse au sujet."},
    )
    assert resp.status_code == 201
    assert resp.data["auteur"]["id"] == str(membre.id)
    assert sujet.nombre_reponses == 1


def test_repondre_notifie_lauteur_du_sujet_et_les_precedents_repondants_mais_pas_le_replier(
    api_client, mailoutbox
):
    """Ajouté le 2026-09-16 — voir apps.communaute.notifications.notifier_nouvelle_reponse_forum.
    Volontairement pas un broadcast à tous les membres (trop fréquent sur un forum actif) :
    seuls l'auteur du sujet et les précédents répondants sont notifiés."""
    auteur_user, auteur_membre = _user_avec_membre(Role.MEMBRE, "auteur-sujet@example.de")
    premier_user, premier_membre = _user_avec_membre(Role.MEMBRE, "premier-repondant@example.de")
    replier_user, _replier_membre = _user_avec_membre(Role.MEMBRE, "nouveau-repondant@example.de")
    tiers_user, _tiers_membre = _user_avec_membre(Role.MEMBRE, "sans-rapport@example.de")

    sujet = SujetFactory(auteur=auteur_membre, titre="Discussion AG")
    ReponseForumFactory(sujet=sujet, auteur=premier_membre)

    resp = _auth(api_client, replier_user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Une nouvelle réponse."},
    )

    assert resp.status_code == 201
    destinataires = set(
        Notification.objects.filter(
            type_notification=TypeNotification.COMMUNAUTE_REPONSE_FORUM
        ).values_list("destinataire_id", flat=True)
    )
    assert destinataires == {auteur_user.id, premier_user.id}
    assert Notification.objects.filter(destinataire=replier_user).count() == 0
    assert Notification.objects.filter(destinataire=tiers_user).count() == 0
    assert len(mailoutbox) == 2


def test_repondre_a_son_propre_sujet_sans_autre_repondant_ne_notifie_personne(api_client):
    """Ajouté le 2026-09-16 — l'auteur du sujet qui répond à sa propre discussion (et qu'il n'y
    a pas encore d'autre répondant) n'a personne à notifier."""
    auteur_user, auteur_membre = _user_avec_membre(Role.MEMBRE, "auteur-solo@example.de")
    sujet = SujetFactory(auteur=auteur_membre)

    resp = _auth(api_client, auteur_user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Je précise mon propos."},
    )

    assert resp.status_code == 201
    assert Notification.objects.count() == 0


def test_detail_dun_sujet_inclut_ses_reponses_mais_pas_la_liste(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m18@example.de")
    sujet = SujetFactory()
    ReponseForumFactory(sujet=sujet, contenu="Première réponse")

    resp_liste = _auth(api_client, user).get(reverse(SUJET_LIST_URL))
    assert resp_liste.data["results"][0]["reponses"] == []

    resp_detail = api_client.get(_sujet_detail_url(sujet))
    assert len(resp_detail.data["reponses"]) == 1
    assert resp_detail.data["reponses"][0]["contenu"] == "Première réponse"


def test_masquer_reponse_forum_reserve_au_bureau_admin(api_client):
    reponse = ReponseForumFactory()
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "m19@example.de")
    resp = _auth(api_client, membre_user).post(
        reverse("communaute:reponse-forum-masquer", args=[reponse.id])
    )
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "admin6@example.de")
    resp = _auth(api_client, admin_user).post(
        reverse("communaute:reponse-forum-masquer", args=[reponse.id])
    )
    assert resp.status_code == 200
    reponse.refresh_from_db()
    assert reponse.est_masquee is True


def test_filtre_sujets_par_categorie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m20@example.de")
    SujetFactory(categorie=CategorieForum.EMPLOI, titre="Sujet emploi")
    SujetFactory(categorie=CategorieForum.FOOTBALL_CA, titre="Sujet foot")
    resp = _auth(api_client, user).get(reverse(SUJET_LIST_URL), {"categorie": "emploi"})
    titres = [s["titre"] for s in resp.data["results"]]
    assert titres == ["Sujet emploi"]


def test_filtre_publications_par_hashtag(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m21@example.de")
    p1 = PublicationFactory(contenu="Post #Berlin")
    p1.synchroniser_hashtags()
    p2 = PublicationFactory(contenu="Post sans rapport")
    p2.synchroniser_hashtags()

    resp = _auth(api_client, user).get(reverse(PUBLICATION_LIST_URL), {"hashtag": "berlin"})
    ids = [p["id"] for p in resp.data["results"]]
    assert ids == [str(p1.id)]


def test_regression_pagination_ne_leve_pas_malgre_lordre_multi_champs(api_client):
    """La pagination par curseur de Sujet trie sur (-est_epingle, -created_at, id) — un
    tri à 3 champs doit rester déterministe et ne jamais lever d'erreur, même principe
    que la régression VarianteProduit en Boutique (ordering incomplet -> 500)."""
    user, _ = _user_avec_membre(Role.MEMBRE, "m22@example.de")
    for i in range(3):
        SujetFactory(titre=f"Sujet {i}")
    resp = _auth(api_client, user).get(reverse(SUJET_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 3


# --- Messagerie privée : conversations + historique (REST = lecture seule, voir consumers.py) ---

CONVERSATION_LIST_URL = "communaute:conversation-list"
MESSAGE_PRIVE_LIST_URL = "communaute:message-prive-list"


def test_conversation_list_ne_montre_que_mes_conversations(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "c1@example.de")
    ma_conversation = ConversationFactory(membre_a=membre)
    ConversationFactory()  # conversation d'autrui

    resp = _auth(api_client, user).get(reverse(CONVERSATION_LIST_URL))
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.data["results"]]
    assert ids == [str(ma_conversation.id)]


def test_creer_une_conversation_avec_un_destinataire(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "c2@example.de")
    destinataire = MembreFactory()
    resp = _auth(api_client, user).post(
        reverse(CONVERSATION_LIST_URL), {"destinataire": str(destinataire.id)}
    )
    assert resp.status_code == 201
    assert resp.data["autre_participant"]["id"] == str(destinataire.id)
    assert Conversation.objects.count() == 1


def test_creer_une_conversation_existante_ne_la_duplique_pas(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "c3@example.de")
    destinataire = MembreFactory()
    Conversation.get_or_create_entre(membre, destinataire)

    resp = _auth(api_client, user).post(
        reverse(CONVERSATION_LIST_URL), {"destinataire": str(destinataire.id)}
    )
    assert resp.status_code == 201
    assert Conversation.objects.count() == 1


def test_conversation_retrieve_refuse_a_un_non_participant(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "c4@example.de")
    conversation = ConversationFactory()  # ni membre_a ni membre_b n'est notre membre
    resp = _auth(api_client, user).get(
        reverse("communaute:conversation-detail", args=[conversation.id])
    )
    assert resp.status_code in (403, 404)


def test_messages_prives_necessite_le_parametre_conversation(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "c5@example.de")
    resp = _auth(api_client, user).get(reverse(MESSAGE_PRIVE_LIST_URL))
    assert resp.status_code == 400


def test_messages_prives_refuse_a_un_non_participant(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "c6@example.de")
    conversation = ConversationFactory()
    resp = _auth(api_client, user).get(
        reverse(MESSAGE_PRIVE_LIST_URL), {"conversation": str(conversation.id)}
    )
    assert resp.status_code == 403


def test_messages_prives_liste_pour_un_participant_et_dechiffre_le_contenu(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "c7@example.de")
    conversation = ConversationFactory(membre_a=membre)
    MessagePriveFactory(conversation=conversation, expediteur=membre, contenu="Salut !")

    resp = _auth(api_client, user).get(
        reverse(MESSAGE_PRIVE_LIST_URL), {"conversation": str(conversation.id)}
    )
    assert resp.status_code == 200
    assert resp.data["results"][0]["contenu"] == "Salut !"
    assert resp.data["results"][0]["est_expediteur"] is True


def _message_prive_detail_url(message):
    return reverse("communaute:message-prive-detail", args=[message.id])


def test_lexpediteur_peut_supprimer_son_propre_message_prive(api_client):
    # Demande utilisateur du 2026-09-16 ("Nachricht ... kann vom Ersteller gelöscht
    # werden").
    user, membre = _user_avec_membre(Role.MEMBRE, "c8@example.de")
    conversation = ConversationFactory(membre_a=membre)
    message = MessagePriveFactory(conversation=conversation, expediteur=membre)
    resp = _auth(api_client, user).delete(_message_prive_detail_url(message))
    assert resp.status_code == 204
    assert not Conversation.objects.get(id=conversation.id).messages.filter(id=message.id).exists()


def test_lautre_participant_ne_peut_pas_supprimer_le_message_prive_dautrui(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "c9@example.de")
    conversation = ConversationFactory(membre_a=membre)
    message = MessagePriveFactory(conversation=conversation)  # expéditeur = l'autre membre
    resp = _auth(api_client, user).delete(_message_prive_detail_url(message))
    assert resp.status_code == 403
    assert Conversation.objects.get(id=conversation.id).messages.filter(id=message.id).exists()


def test_un_tiers_ne_peut_pas_supprimer_un_message_prive_dune_conversation_etrangere(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "c10@example.de")
    message = MessagePriveFactory()  # conversation totalement étrangère
    resp = _auth(api_client, user).delete(_message_prive_detail_url(message))
    assert resp.status_code == 403


def _message_prive_liker_url(message):
    return reverse("communaute:message-prive-liker", args=[message.id])


def test_liker_un_message_prive_puis_le_deliker(api_client):
    # Demande utilisateur 2026-09-25 ("auf einzelnen Nachrichten zu reagieren (Like)").
    user, membre = _user_avec_membre(Role.MEMBRE, "c11@example.de")
    conversation = ConversationFactory(membre_a=membre)
    message = MessagePriveFactory(conversation=conversation)

    resp = _auth(api_client, user).post(_message_prive_liker_url(message))
    assert resp.status_code == 200, resp.data
    assert resp.data["jaime"] is True
    assert resp.data["nombre_likes"] == 1

    resp = _auth(api_client, user).post(_message_prive_liker_url(message))
    assert resp.status_code == 200
    assert resp.data["jaime"] is False
    assert resp.data["nombre_likes"] == 0


def test_liker_un_message_prive_refuse_a_un_non_participant(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "c12@example.de")
    message = MessagePriveFactory()  # conversation totalement étrangère
    resp = _auth(api_client, user).post(_message_prive_liker_url(message))
    assert resp.status_code == 403
    assert not MessagePriveLike.objects.filter(message=message).exists()


# --- Annuaire de recherche de membres (démarrer une conversation / inviter dans un groupe
# privé) — distinct de apps.membres, voir MembreRechercheViewSet ---

MEMBRE_RECHERCHE_LIST_URL = "communaute:membre-recherche-list"


def test_membre_recherche_sans_q_renvoie_une_liste_parcourable(api_client):
    """Sans recherche, l'annuaire doit rester utilisable pour choisir un destinataire sans
    connaître son nom exact (bug remonté en test manuel Phase 4), pas renvoyer une liste vide."""
    user, _ = _user_avec_membre(Role.MEMBRE, "r1@example.de")
    MembreFactory(nom="Werfelli", prenom="Sana")
    MembreFactory(nom="Meddeb", prenom="Hamza")

    resp = _auth(api_client, user).get(reverse(MEMBRE_RECHERCHE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_membre_recherche_filtre_par_nom_ou_prenom(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "r2@example.de")
    MembreFactory(nom="Werfelli", prenom="Sana")
    MembreFactory(nom="Meddeb", prenom="Hamza")

    resp = _auth(api_client, user).get(reverse(MEMBRE_RECHERCHE_LIST_URL), {"q": "ham"})
    assert resp.status_code == 200
    assert [m["prenom"] for m in resp.data["results"]] == ["Hamza"]


def test_membre_recherche_exclut_le_membre_courant_et_les_inactifs(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "r3@example.de")
    MembreFactory(statut=StatutMembre.INACTIF, nom="Ancien")

    resp = _auth(api_client, user).get(reverse(MEMBRE_RECHERCHE_LIST_URL))
    assert resp.status_code == 200
    ids = [m["id"] for m in resp.data["results"]]
    assert str(membre.id) not in ids
    assert len(resp.data["results"]) == 0


def test_membre_recherche_expose_uniquement_lidentite_minimale(api_client):
    """Pas d'email/adresse/CIN — voir AuteurSerializer, à la différence de
    apps.membres.MembreListSerializer réservé RH+."""
    user, _ = _user_avec_membre(Role.MEMBRE, "r4@example.de")
    MembreFactory(nom="Werfelli", prenom="Sana")

    resp = _auth(api_client, user).get(reverse(MEMBRE_RECHERCHE_LIST_URL))
    assert resp.status_code == 200
    assert set(resp.data["results"][0].keys()) == {"id", "prenom", "nom", "photo"}


# --- Groupes de chat ---

GROUPE_LIST_URL = "communaute:groupe-chat-list"
MESSAGE_GROUPE_LIST_URL = "communaute:message-groupe-list"


def test_groupe_public_visible_par_tous_les_membres(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g1@example.de")
    GroupeChatFactory(nom="Supporters Berlin")
    resp = _auth(api_client, user).get(reverse(GROUPE_LIST_URL))
    noms = [g["nom"] for g in resp.data["results"]]
    assert "Supporters Berlin" in noms


def test_groupe_prive_invisible_a_un_non_membre(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g2@example.de")
    GroupeChatFactory(nom="Bureau restreint", type_groupe="prive")
    resp = _auth(api_client, user).get(reverse(GROUPE_LIST_URL))
    noms = [g["nom"] for g in resp.data["results"]]
    assert "Bureau restreint" not in noms


def test_creer_un_groupe_prive_avec_invitations_ajoute_les_membres(api_client):
    user, createur = _user_avec_membre(Role.MEMBRE, "g3@example.de")
    invite = MembreFactory()
    resp = _auth(api_client, user).post(
        reverse(GROUPE_LIST_URL),
        {
            "nom": "Groupe privé",
            "type_groupe": "prive",
            "membres_invites": [str(invite.id)],
        },
    )
    assert resp.status_code == 201, resp.data
    groupe_id = resp.data["id"]
    assert MembreGroupe.objects.filter(groupe_id=groupe_id, membre=createur).exists()
    assert MembreGroupe.objects.filter(groupe_id=groupe_id, membre=invite).exists()


def test_rejoindre_un_groupe_public(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "g4@example.de")
    groupe = GroupeChatFactory()
    resp = _auth(api_client, user).post(
        reverse("communaute:groupe-chat-rejoindre", args=[groupe.id])
    )
    assert resp.status_code == 200
    assert MembreGroupe.objects.filter(groupe=groupe, membre=membre).exists()


def test_rejoindre_un_groupe_prive_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g5@example.de")
    groupe = GroupeChatFactory(type_groupe="prive")
    resp = _auth(api_client, user).post(
        reverse("communaute:groupe-chat-rejoindre", args=[groupe.id])
    )
    assert resp.status_code == 404  # invisible dans le queryset (ni public, ni déjà membre)


def test_quitter_un_groupe(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "g6@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=membre)
    resp = _auth(api_client, user).post(reverse("communaute:groupe-chat-quitter", args=[groupe.id]))
    assert resp.status_code == 200
    assert not MembreGroupe.objects.filter(groupe=groupe, membre=membre).exists()


def test_inviter_reserve_au_createur_ou_bureau_admin(api_client):
    createur_user, createur = _user_avec_membre(Role.MEMBRE, "g7@example.de")
    groupe = GroupeChatFactory(createur=createur, type_groupe="prive")
    MembreGroupeFactory(groupe=groupe, membre=createur)
    invite = MembreFactory()

    autre_user, _ = _user_avec_membre(Role.MEMBRE, "g8@example.de")
    resp = _auth(api_client, autre_user).post(
        reverse("communaute:groupe-chat-inviter", args=[groupe.id]), {"membres": [str(invite.id)]}
    )
    assert resp.status_code == 404  # groupe privé invisible pour un non-membre

    resp = _auth(api_client, createur_user).post(
        reverse("communaute:groupe-chat-inviter", args=[groupe.id]), {"membres": [str(invite.id)]}
    )
    assert resp.status_code == 200
    assert MembreGroupe.objects.filter(groupe=groupe, membre=invite).exists()


def _groupe_detail_url(groupe):
    return reverse("communaute:groupe-chat-detail", args=[groupe.id])


def test_est_createur_reflete_le_membre_courant_du_groupe(api_client):
    # Demande utilisateur du 2026-09-16 ("Besprechungen ... vom Ersteller gelöscht werden")
    # — utilisé par le frontend pour n'afficher "Supprimer le groupe" qu'au créateur.
    user, createur = _user_avec_membre(Role.MEMBRE, "g12@example.de")
    mien = GroupeChatFactory(createur=createur)
    dautrui = GroupeChatFactory()
    resp = _auth(api_client, user).get(reverse(GROUPE_LIST_URL))
    par_id = {g["id"]: g["est_createur"] for g in resp.data["results"]}
    assert par_id[str(mien.id)] is True
    assert par_id[str(dautrui.id)] is False


def test_le_createur_peut_supprimer_son_groupe(api_client):
    user, createur = _user_avec_membre(Role.MEMBRE, "g13@example.de")
    groupe = GroupeChatFactory(createur=createur)
    resp = _auth(api_client, user).delete(_groupe_detail_url(groupe))
    assert resp.status_code == 204


def test_un_membre_normal_ne_peut_pas_supprimer_le_groupe_dautrui(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "g14@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=membre)
    resp = _auth(api_client, user).delete(_groupe_detail_url(groupe))
    assert resp.status_code == 403


def test_bureau_admin_peut_supprimer_le_groupe_dautrui(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "g15@example.de")
    groupe = GroupeChatFactory()
    resp = _auth(api_client, user).delete(_groupe_detail_url(groupe))
    assert resp.status_code == 204


def test_messages_groupe_necessite_le_parametre_groupe(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g9@example.de")
    resp = _auth(api_client, user).get(reverse(MESSAGE_GROUPE_LIST_URL))
    assert resp.status_code == 400


def test_messages_groupe_prive_refuse_a_un_non_membre(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g10@example.de")
    groupe = GroupeChatFactory(type_groupe="prive")
    resp = _auth(api_client, user).get(reverse(MESSAGE_GROUPE_LIST_URL), {"groupe": str(groupe.id)})
    assert resp.status_code == 403


def test_messages_groupe_liste_pour_un_groupe_public(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g11@example.de")
    groupe = GroupeChatFactory()
    MessageGroupeFactory(groupe=groupe, contenu="Bienvenue !")
    resp = _auth(api_client, user).get(reverse(MESSAGE_GROUPE_LIST_URL), {"groupe": str(groupe.id)})
    assert resp.status_code == 200
    assert resp.data["results"][0]["contenu"] == "Bienvenue !"


def _message_groupe_detail_url(message):
    return reverse("communaute:message-groupe-detail", args=[message.id])


def test_lauteur_peut_supprimer_son_propre_message_de_groupe(api_client):
    # Demande utilisateur du 2026-09-16 ("Nachricht ... kann vom Ersteller gelöscht
    # werden") — même principe que la messagerie privée.
    user, membre = _user_avec_membre(Role.MEMBRE, "g16@example.de")
    groupe = GroupeChatFactory()
    message = MessageGroupeFactory(groupe=groupe, auteur=membre)
    resp = _auth(api_client, user).delete(_message_groupe_detail_url(message))
    assert resp.status_code == 204
    assert not MessageGroupe.objects.filter(id=message.id).exists()


def test_un_autre_membre_ne_peut_pas_supprimer_le_message_de_groupe_dautrui(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "g17@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=membre)
    message = MessageGroupeFactory(groupe=groupe)  # auteur = un autre membre
    resp = _auth(api_client, user).delete(_message_groupe_detail_url(message))
    assert resp.status_code == 403
    assert MessageGroupe.objects.filter(id=message.id).exists()


def test_un_bureau_admin_ne_peut_pas_supprimer_le_message_de_groupe_dautrui(api_client):
    # Pas de modération dédiée pour ce sous-module (voir MessageGroupePermission) — la
    # demande utilisateur ne porte que sur l'auteur/"Ersteller", pas sur un rôle Admin.
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "g18@example.de")
    message = MessageGroupeFactory()
    resp = _auth(api_client, user).delete(_message_groupe_detail_url(message))
    assert resp.status_code == 403


def _message_groupe_liker_url(message):
    return reverse("communaute:message-groupe-liker", args=[message.id])


def test_liker_un_message_de_groupe_puis_le_deliker(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "g19@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=membre)
    message = MessageGroupeFactory(groupe=groupe)

    resp = _auth(api_client, user).post(_message_groupe_liker_url(message))
    assert resp.status_code == 200, resp.data
    assert resp.data["jaime"] is True
    assert resp.data["nombre_likes"] == 1

    resp = _auth(api_client, user).post(_message_groupe_liker_url(message))
    assert resp.status_code == 200
    assert resp.data["jaime"] is False
    assert resp.data["nombre_likes"] == 0


def test_liker_un_message_de_groupe_prive_refuse_a_un_non_membre(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g20@example.de")
    groupe = GroupeChatFactory(type_groupe="prive")
    message = MessageGroupeFactory(groupe=groupe)
    resp = _auth(api_client, user).post(_message_groupe_liker_url(message))
    assert resp.status_code == 403
    assert not MessageGroupeLike.objects.filter(message=message).exists()


def test_liker_un_message_de_groupe_public_autorise_a_tout_authentifie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "g21@example.de")
    groupe = GroupeChatFactory()  # public par défaut
    message = MessageGroupeFactory(groupe=groupe)
    resp = _auth(api_client, user).post(_message_groupe_liker_url(message))
    assert resp.status_code == 200
    assert resp.data["jaime"] is True


# ---------------------------------------------------------------------------
# Live Match, Albums, Quiz (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------

MATCH_LIST_URL = "communaute:match-list"
MATCH_COMMENTAIRE_LIST_URL = "communaute:match-commentaire-list"
ALBUM_LIST_URL = "communaute:album-list"
PHOTO_LIST_URL = "communaute:photo-list"
PHOTO_COMMENTAIRE_LIST_URL = "communaute:photo-commentaire-list"
QUIZ_LIST_URL = "communaute:quiz-list"
QUESTION_QUIZ_LIST_URL = "communaute:quiz-question-list"
CHOIX_QUESTION_LIST_URL = "communaute:quiz-choix-list"


def _match_detail_url(match):
    return reverse("communaute:match-detail", args=[match.id])


def _album_detail_url(album):
    return reverse("communaute:album-detail", args=[album.id])


def _photo_detail_url(photo):
    return reverse("communaute:photo-detail", args=[photo.id])


def _photo_liker_url(photo):
    return reverse("communaute:photo-liker", args=[photo.id])


def _photo_masquer_url(photo):
    return reverse("communaute:photo-masquer", args=[photo.id])


def _quiz_demarrer_url(quiz):
    return reverse("communaute:quiz-demarrer", args=[quiz.id])


def _quiz_repondre_url(quiz):
    return reverse("communaute:quiz-repondre", args=[quiz.id])


def _quiz_classement_url(quiz):
    return reverse("communaute:quiz-classement", args=[quiz.id])


def _image_valide(nom="photo.jpg", format_pillow="JPEG", content_type="image/jpeg"):
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color=(255, 0, 0)).save(buffer, format=format_pillow)
    buffer.seek(0)
    return SimpleUploadedFile(nom, buffer.read(), content_type=content_type)


# --- Live Match --------------------------------------------------------------------


def test_match_list_ouvert_a_tout_authentifie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "live1@example.de")
    MatchFactory(adversaire="EST")
    resp = _auth(api_client, user).get(reverse(MATCH_LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["adversaire"] == "EST"


def test_creer_un_match_reserve_au_bureau_admin(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "live2@example.de")
    payload = {"adversaire": "ES Sahel", "date_heure": "2026-10-01T18:00:00Z"}
    resp = _auth(api_client, user).post(reverse(MATCH_LIST_URL), payload)
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "live3@example.de")
    resp = _auth(api_client, admin_user).post(reverse(MATCH_LIST_URL), payload)
    assert resp.status_code == 201
    assert resp.data["adversaire"] == "ES Sahel"


def test_modifier_le_score_dun_match_reserve_au_bureau_admin(api_client):
    match = MatchFactory(score_ca=0, score_adversaire=0)
    user, _ = _user_avec_membre(Role.MEMBRE, "live4@example.de")
    resp = _auth(api_client, user).patch(_match_detail_url(match), {"score_ca": 1})
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "live5@example.de")
    resp = _auth(api_client, admin_user).patch(_match_detail_url(match), {"score_ca": 1})
    assert resp.status_code == 200
    assert resp.data["score_ca"] == 1


def test_match_commentaires_necessite_le_parametre_match(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "live6@example.de")
    resp = _auth(api_client, user).get(reverse(MATCH_COMMENTAIRE_LIST_URL))
    assert resp.status_code == 400


def test_match_commentaires_liste_lhistorique(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "live7@example.de")
    match = MatchFactory()
    MatchCommentaireFactory(match=match, contenu="Allez le CA !")
    resp = _auth(api_client, user).get(
        reverse(MATCH_COMMENTAIRE_LIST_URL), {"match": str(match.id)}
    )
    assert resp.status_code == 200
    assert resp.data["results"][0]["contenu"] == "Allez le CA !"


def test_reactions_agregees_par_emoji_dans_le_detail_du_match(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "live8@example.de")
    match = MatchFactory()
    MatchReactionFactory(match=match, emoji="coeur")
    MatchReactionFactory(match=match, emoji="coeur")
    MatchReactionFactory(match=match, emoji="feu")
    resp = _auth(api_client, user).get(_match_detail_url(match))
    assert resp.status_code == 200
    assert resp.data["reactions"]["coeur"] == 2
    assert resp.data["reactions"]["feu"] == 1
    assert resp.data["reactions"]["etoile"] == 0  # présent même à 0, voir serializer


# --- Fan-Club (classement/calendrier/événements de match, module ajouté le 2026-09-24) ---

CLASSEMENT_LIST_URL = "communaute:classement-list"
CALENDRIER_LIST_URL = "communaute:calendrier-list"
STATISTIQUE_JOUEUR_LIST_URL = "communaute:statistique-joueur-list"
EQUIPE_INFO_LIST_URL = "communaute:equipe-info-list"
MATCH_EVENEMENT_LIST_URL = "communaute:match-evenement-list"


def test_classement_lecture_ouverte_a_tout_authentifie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc1@example.de")
    # Saison en cours explicite : le queryset ne montre plus que la saison courante par
    # défaut (voir tests dédiés ci-dessous), le défaut de fabrique ("2025-2026", voir
    # factories.py) ne correspond pas forcément à la saison réelle du jour du test.
    ClassementLigueFactory(saison=services._saison_actuelle(), equipe="Club Africain", rang=1)
    resp = _auth(api_client, user).get(reverse(CLASSEMENT_LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["equipe"] == "Club Africain"


def test_classement_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(CLASSEMENT_LIST_URL))
    assert resp.status_code == 401


def test_classement_lecture_seule_pas_de_creation_via_api(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "fc2@example.de")
    resp = _auth(api_client, admin_user).post(
        reverse(CLASSEMENT_LIST_URL), {"saison": "2025-2026", "equipe": "Club Africain", "rang": 1}
    )
    # Aucune action POST exposée (mixins.ListModelMixin seul) — toujours synchronisé
    # depuis GOAL API, voir services.py.
    assert resp.status_code == 405


def test_classement_masque_les_anciennes_saisons_par_defaut(api_client):
    # Correctif bug utilisateur "Tabelle ist falsch und Listet Daten aus alten Säsons"
    # (2026-09-24) : `ClassementCursorPagination` trie par saison croissante, donc une
    # ancienne saison pouvait dominer la première page une fois 2+ saisons synchronisées.
    # `get_queryset()` filtre désormais sur la saison en cours par défaut.
    user, _ = _user_avec_membre(Role.MEMBRE, "fc1b@example.de")
    saison_actuelle = services._saison_actuelle()
    ClassementLigueFactory(saison="2019-2020", equipe="Ancienne Saison", rang=1)
    ClassementLigueFactory(saison=saison_actuelle, equipe="Club Africain", rang=1)

    resp = _auth(api_client, user).get(reverse(CLASSEMENT_LIST_URL))
    assert resp.status_code == 200
    equipes = [ligne["equipe"] for ligne in resp.data["results"]]
    assert equipes == ["Club Africain"]


def test_classement_parametre_saison_explicite(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc1c@example.de")
    ClassementLigueFactory(saison="2019-2020", equipe="Ancienne Saison", rang=1)
    ClassementLigueFactory(saison=services._saison_actuelle(), equipe="Club Africain", rang=1)

    resp = _auth(api_client, user).get(reverse(CLASSEMENT_LIST_URL), {"saison": "2019-2020"})
    assert resp.status_code == 200
    assert [ligne["equipe"] for ligne in resp.data["results"]] == ["Ancienne Saison"]


def test_classement_parametre_saison_toutes(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc1d@example.de")
    ClassementLigueFactory(saison="2019-2020", equipe="Ancienne Saison", rang=1)
    ClassementLigueFactory(saison=services._saison_actuelle(), equipe="Club Africain", rang=1)

    resp = _auth(api_client, user).get(reverse(CLASSEMENT_LIST_URL), {"saison": "toutes"})
    assert resp.status_code == 200
    equipes = {ligne["equipe"] for ligne in resp.data["results"]}
    assert equipes == {"Ancienne Saison", "Club Africain"}


def test_calendrier_lecture_ouverte_a_tout_authentifie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc3@example.de")
    RencontreCalendrierFactory(equipe_domicile="Club Africain", equipe_exterieur="EST")
    resp = _auth(api_client, user).get(reverse(CALENDRIER_LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["equipe_exterieur"] == "EST"


def test_statistiques_joueurs_lecture_ouverte_a_tout_authentifie(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc3b@example.de")
    # Même remarque que test_classement_lecture_ouverte_a_tout_authentifie ci-dessus.
    StatistiqueJoueurFactory(saison=services._saison_actuelle(), nom="Sadok Kadida", buts=4)
    resp = _auth(api_client, user).get(reverse(STATISTIQUE_JOUEUR_LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["nom"] == "Sadok Kadida"


def test_statistiques_joueurs_masque_les_anciennes_saisons_par_defaut(api_client):
    # Même correctif que test_classement_masque_les_anciennes_saisons_par_defaut ci-dessus.
    # Défense en profondeur seulement pour ce modèle : `StatistiqueJoueur.goal_api_id` est
    # la SEULE contrainte d'unicité (pas saison+goal_api_id, voir models.py) — un joueur
    # d'une saison révolue ne devrait normalement plus exister en base une fois resynchro-
    # nisé (écrasé par `update_or_create`), mais ce filtre protège quand même contre toute
    # ligne au champ `saison` resté périmé (ex. resynchronisation partielle/interrompue).
    user, _ = _user_avec_membre(Role.MEMBRE, "fc3d@example.de")
    saison_actuelle = services._saison_actuelle()
    StatistiqueJoueurFactory(saison="2019-2020", nom="Vieux Joueur", buts=1)
    StatistiqueJoueurFactory(saison=saison_actuelle, nom="Sadok Kadida", buts=4)

    resp = _auth(api_client, user).get(reverse(STATISTIQUE_JOUEUR_LIST_URL))
    assert resp.status_code == 200
    noms = [ligne["nom"] for ligne in resp.data["results"]]
    assert noms == ["Sadok Kadida"]


def test_statistiques_joueurs_parametre_saison_toutes(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc3e@example.de")
    StatistiqueJoueurFactory(saison="2019-2020", nom="Vieux Joueur", buts=1)
    StatistiqueJoueurFactory(saison=services._saison_actuelle(), nom="Sadok Kadida", buts=4)

    resp = _auth(api_client, user).get(reverse(STATISTIQUE_JOUEUR_LIST_URL), {"saison": "toutes"})
    assert resp.status_code == 200
    noms = {ligne["nom"] for ligne in resp.data["results"]}
    assert noms == {"Vieux Joueur", "Sadok Kadida"}


def test_statistiques_joueurs_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(STATISTIQUE_JOUEUR_LIST_URL))
    assert resp.status_code == 401


def test_statistiques_joueurs_lecture_seule_pas_de_creation_via_api(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "fc3c@example.de")
    resp = _auth(api_client, admin_user).post(
        reverse(STATISTIQUE_JOUEUR_LIST_URL), {"goal_api_id": "player-x", "nom": "Test"}
    )
    # Aucune action POST exposée (mixins.ListModelMixin seul) — toujours synchronisé
    # depuis GOAL API, voir services.py.
    assert resp.status_code == 405


# --- EquipeInfo (2026-09-24, redesign dashboard Statistiken) ---
# Singleton `pk=EquipeInfo.PK_UNIQUE` alimenté par `services.synchroniser_equipe_info()`
# (GOAL API `/teams/{id}`, endpoint marqué NON VÉRIFIÉ, voir services.py). Pas de
# EquipeInfoFactory : un seul enregistrement possible, créé directement ici.


def test_equipe_info_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(EQUIPE_INFO_LIST_URL))
    assert resp.status_code == 401


def test_equipe_info_cree_a_la_premiere_consultation_si_absent(api_client):
    # `EquipeInfoViewSet.list()` fait un `get_or_create` : avant toute synchronisation
    # GOAL API, l'endpoint ne doit pas 404/500 mais renvoyer un singleton vide.
    user, _ = _user_avec_membre(Role.MEMBRE, "fc6a@example.de")
    assert not EquipeInfo.objects.exists()

    resp = _auth(api_client, user).get(reverse(EQUIPE_INFO_LIST_URL))

    assert resp.status_code == 200
    assert resp.data["nom"] == ""
    assert EquipeInfo.objects.count() == 1


def test_equipe_info_retourne_les_donnees_synchronisees(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc6b@example.de")
    EquipeInfo.objects.create(
        pk=EquipeInfo.PK_UNIQUE,
        nom="Club Africain",
        stade="Stade Olympique de Radès",
        ville="Radès",
        pays="Tunisie",
        entraineur="Faouzi Benzarti",
        fondee_en=1920,
    )

    resp = _auth(api_client, user).get(reverse(EQUIPE_INFO_LIST_URL))

    assert resp.status_code == 200
    assert resp.data["nom"] == "Club Africain"
    assert resp.data["stade"] == "Stade Olympique de Radès"
    assert resp.data["fondee_en"] == 1920
    # Champs internes jamais exposés (voir EquipeInfoSerializer).
    assert "id" not in resp.data
    assert "donnees_brutes" not in resp.data


def test_equipe_info_reste_singleton_apres_plusieurs_appels(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc6c@example.de")

    _auth(api_client, user).get(reverse(EQUIPE_INFO_LIST_URL))
    _auth(api_client, user).get(reverse(EQUIPE_INFO_LIST_URL))

    assert EquipeInfo.objects.count() == 1


def test_equipe_info_lecture_seule_pas_de_creation_via_api(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "fc6d@example.de")
    resp = _auth(api_client, admin_user).post(reverse(EQUIPE_INFO_LIST_URL), {"nom": "Test"})
    # Aucune action POST exposée (mixins.ListModelMixin seul) — toujours synchronisé
    # depuis GOAL API, voir services.py.
    assert resp.status_code == 405


def test_match_evenements_necessite_le_parametre_match(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc4@example.de")
    resp = _auth(api_client, user).get(reverse(MATCH_EVENEMENT_LIST_URL))
    assert resp.status_code == 400


def test_match_evenements_liste_lhistorique(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "fc5@example.de")
    match = MatchFactory()
    MatchEvenementFactory(match=match, type_evenement="but", minute=12)
    resp = _auth(api_client, user).get(reverse(MATCH_EVENEMENT_LIST_URL), {"match": str(match.id)})
    assert resp.status_code == 200
    assert resp.data["results"][0]["type_evenement"] == "but"
    assert resp.data["results"][0]["minute"] == 12


def test_creer_un_match_evenement_reserve_au_bureau_admin(api_client):
    # IDOR/permission — un membre standard ne doit JAMAIS pouvoir ajouter un événement au
    # Live-Ticker, même sur un match existant qu'il peut consulter (voir
    # MatchEvenementPermission, même seuil que MatchPermission).
    match = MatchFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "fc6@example.de")
    payload = {"match": str(match.id), "type_evenement": "but", "minute": 34, "equipe": "ca"}
    resp = _auth(api_client, user).post(reverse(MATCH_EVENEMENT_LIST_URL), payload)
    assert resp.status_code == 403
    assert match.evenements.count() == 0

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "fc7@example.de")
    resp = _auth(api_client, admin_user).post(reverse(MATCH_EVENEMENT_LIST_URL), payload)
    assert resp.status_code == 201
    assert resp.data["type_evenement"] == "but"
    assert resp.data["minute"] == 34
    assert match.evenements.count() == 1


def test_creer_un_match_evenement_diffuse_au_groupe_websocket(api_client, monkeypatch):
    # Même mécanisme REST -> WS que MatchViewSet._broadcast_match_update (voir
    # test_consumers.py pour le test bout-en-bout côté consumer).
    from apps.communaute import views as communaute_views

    appels = []
    monkeypatch.setattr(
        communaute_views.MatchEvenementViewSet,
        "_broadcast_match_evenement",
        staticmethod(lambda evenement: appels.append(evenement)),
    )
    match = MatchFactory()
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "fc8@example.de")
    payload = {"match": str(match.id), "type_evenement": "carton_jaune", "minute": 55}
    resp = _auth(api_client, admin_user).post(reverse(MATCH_EVENEMENT_LIST_URL), payload)
    assert resp.status_code == 201
    assert len(appels) == 1


# --- Albums photos -------------------------------------------------------------------


def test_creer_un_album_reserve_au_bureau_admin(api_client):
    # Gestion d'album réservée à Bureau Admin+ depuis le 2026-09-22 (retour utilisateur : "Die
    # Verwaltung der Albums soll im Bereich Admin stattfinden") — voir AlbumPermission.
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "alb1@example.de")
    resp = _auth(api_client, membre_user).post(reverse(ALBUM_LIST_URL), {"nom": "Derby 2026"})
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb1b@example.de")
    resp = _auth(api_client, admin_user).post(
        reverse(ALBUM_LIST_URL),
        {"nom": "Derby 2026", "date": "2026-10-03", "lieu": "Berlin"},
    )
    assert resp.status_code == 201
    assert resp.data["nom"] == "Derby 2026"
    assert resp.data["date"] == "2026-10-03"
    assert resp.data["lieu"] == "Berlin"


def test_modifier_un_album_reserve_au_bureau_admin(api_client):
    # Le créateur d'un album (toujours renseigné, voir AlbumSerializer.create) n'a plus de
    # traitement de faveur ici — seul Bureau Admin+ peut modifier, même le créateur d'origine
    # s'il ne l'est plus (voir docstring AlbumPermission).
    createur_user, createur = _user_avec_membre(Role.MEMBRE, "alb2@example.de")
    album = AlbumFactory(createur=createur)

    resp = _auth(api_client, createur_user).patch(_album_detail_url(album), {"nom": "Piraté"})
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb3@example.de")
    resp = _auth(api_client, admin_user).patch(_album_detail_url(album), {"nom": "Renommé"})
    assert resp.status_code == 200
    assert resp.data["nom"] == "Renommé"


def test_photo_couverture_est_absente_pour_un_album_sans_photo(api_client):
    # Demande utilisateur 2026-09-25, module "Fotoalben" : "Fotoalben sollen mit einem
    # Vorschau dargestellt werden als Banner in der Kachel" — voir Album.photo_couverture.
    user, _ = _user_avec_membre(Role.MEMBRE, "alb9@example.de")
    AlbumFactory()
    resp = _auth(api_client, user).get(reverse(ALBUM_LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["photo_couverture"] is None


def test_photo_couverture_renvoie_la_photo_la_plus_recente_non_masquee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "alb10@example.de")
    album = AlbumFactory()
    ancienne = PhotoFactory(album=album)
    # `created_at` est `auto_now_add=True` (voir Photo) : toujours écrasé par `.save()`, donc
    # passer `created_at=` au factory n'a aucun effet — seul `.update()` (SQL brut, pas de
    # pre_save) permet de la reculer dans le temps, même principe que
    # apps.cotisations.tests.test_api pour un champ équivalent.
    Photo.objects.filter(id=ancienne.id).update(created_at=timezone.now() - timedelta(days=1))
    recente = PhotoFactory(album=album)
    masquee_plus_recente = PhotoFactory(album=album, est_masquee=True)

    resp = _auth(api_client, user).get(reverse(ALBUM_LIST_URL))
    assert resp.status_code == 200
    # URL absolue (voir AlbumSerializer.get_photo_couverture, `request.build_absolute_uri`) —
    # même convention que le champ `image` natif de PhotoSerializer.
    assert resp.data["results"][0]["photo_couverture"].endswith(recente.image.url)
    assert masquee_plus_recente.image.url not in (resp.data["results"][0]["photo_couverture"] or "")


def test_upload_photo_reserve_au_bureau_admin(api_client):
    # Même changement que la création d'album (2026-09-22) : un simple membre ne peut plus
    # uploader de photo, seul Bureau Admin+ le peut désormais.
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "alb4@example.de")
    album = AlbumFactory()
    resp = _auth(api_client, membre_user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "legende": "But de Hamza !", "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403


def test_upload_photo_valide(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb4b@example.de")
    album = AlbumFactory()
    resp = _auth(api_client, user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "legende": "But de Hamza !", "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 201
    assert resp.data["legende"] == "But de Hamza !"
    assert resp.data["image"]


def test_upload_photo_rejette_fichier_non_image(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb5@example.de")
    album = AlbumFactory()
    faux_fichier = SimpleUploadedFile("photo.jpg", b"ceci n'est pas une image", "image/jpeg")
    resp = _auth(api_client, user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "image": faux_fichier},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "image" in resp.data["details"]


def test_upload_photo_rejette_fichier_trop_volumineux(api_client, monkeypatch):
    import apps.communaute.validators as validators_module

    monkeypatch.setattr(validators_module, "MAX_PHOTO_SIZE_BYTES", 10)  # 10 octets
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb6@example.de")
    album = AlbumFactory()
    resp = _auth(api_client, user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "image" in resp.data["details"]


def test_supprimer_sa_propre_photo(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "alb7@example.de")
    photo = PhotoFactory(membre=membre)
    resp = _auth(api_client, user).delete(_photo_detail_url(photo))
    assert resp.status_code == 204


def test_supprimer_la_photo_dautrui_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "alb8@example.de")
    photo = PhotoFactory()
    resp = _auth(api_client, user).delete(_photo_detail_url(photo))
    assert resp.status_code == 403


def test_liker_bascule_le_like_photo(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "alb9@example.de")
    photo = PhotoFactory()
    resp = _auth(api_client, user).post(_photo_liker_url(photo))
    assert resp.status_code == 200
    assert resp.data["jaime"] is True
    assert resp.data["nombre_likes"] == 1

    resp = _auth(api_client, user).post(_photo_liker_url(photo))
    assert resp.data["jaime"] is False
    assert resp.data["nombre_likes"] == 0


def test_masquer_une_photo_reserve_au_bureau_admin(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "alb10@example.de")
    photo = PhotoFactory()
    resp = _auth(api_client, user).post(_photo_masquer_url(photo))
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "alb11@example.de")
    resp = _auth(api_client, admin_user).post(_photo_masquer_url(photo))
    assert resp.status_code == 200
    assert resp.data["est_masquee"] is True


def test_commenter_une_photo(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "alb12@example.de")
    photo = PhotoFactory()
    resp = _auth(api_client, user).post(
        reverse(PHOTO_COMMENTAIRE_LIST_URL), {"photo": str(photo.id), "contenu": "Magnifique !"}
    )
    assert resp.status_code == 201
    assert photo.commentaires.count() == 1


# --- Quiz ------------------------------------------------------------------------


def test_quiz_liste_masque_est_correct_pour_membre_normal(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz1@example.de")
    question = QuestionQuizFactory()
    ChoixQuestionFactory(question=question, texte="1920", est_correct=True)
    resp = _auth(api_client, user).get(reverse(QUIZ_LIST_URL))
    assert resp.status_code == 200
    choix = resp.data["results"][0]["questions"][0]["choix"][0]
    assert "est_correct" not in choix


def test_quiz_liste_expose_est_correct_pour_bureau_admin(api_client):
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "quiz2@example.de")
    question = QuestionQuizFactory()
    ChoixQuestionFactory(question=question, texte="1920", est_correct=True)
    resp = _auth(api_client, admin_user).get(reverse(QUIZ_LIST_URL))
    assert resp.status_code == 200
    choix = resp.data["results"][0]["questions"][0]["choix"][0]
    assert choix["est_correct"] is True


def test_demarrer_puis_repondre_calcule_le_score_correctement(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz3@example.de")
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz, points=100)
    bon_choix = ChoixQuestionFactory(question=question, est_correct=True)
    ChoixQuestionFactory(question=question, est_correct=False)

    resp = _auth(api_client, user).post(_quiz_demarrer_url(quiz))
    assert resp.status_code == 200
    assert resp.data["score"] == 0
    assert resp.data["terminee_le"] is None

    resp = _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(bon_choix.id)}
    )
    assert resp.status_code == 201
    assert resp.data["est_correct"] is True
    assert resp.data["points_obtenus"] == 100

    # Une seule question dans ce quiz -> la participation est automatiquement terminée,
    # vérifié via l'action classement (plus direct qu'un re-GET de la participation seule).
    resp = _auth(api_client, user).get(_quiz_classement_url(quiz))
    assert resp.status_code == 200
    assert resp.data["ma_participation"]["score"] == 100
    assert resp.data["ma_participation"]["terminee_le"] is not None


def test_repondre_avec_un_mauvais_choix_ne_rapporte_aucun_point(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz4@example.de")
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz, points=100)
    ChoixQuestionFactory(question=question, est_correct=True)
    mauvais_choix = ChoixQuestionFactory(question=question, est_correct=False)

    _auth(api_client, user).post(_quiz_demarrer_url(quiz))
    resp = _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(mauvais_choix.id)}
    )
    assert resp.status_code == 201
    assert resp.data["est_correct"] is False
    assert resp.data["points_obtenus"] == 0


def test_repondre_deux_fois_a_la_meme_question_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz5@example.de")
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz)
    # Deuxième question du même quiz — sans elle, répondre à l'unique question termine la
    # participation (voir QuizViewSet.repondre) et le deuxième essai buterait sur le
    # contrôle "déjà terminée" (403) plutôt que sur celui testé ici (réponse dupliquée, 400).
    QuestionQuizFactory(quiz=quiz)
    choix = ChoixQuestionFactory(question=question, est_correct=True)

    _auth(api_client, user).post(_quiz_demarrer_url(quiz))
    _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(choix.id)}
    )
    resp = _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(choix.id)}
    )
    assert resp.status_code == 400


def test_repondre_sans_avoir_demarre_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz6@example.de")
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz)
    choix = ChoixQuestionFactory(question=question, est_correct=True)
    resp = _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(choix.id)}
    )
    assert resp.status_code == 400


def test_repondre_apres_participation_terminee_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz7@example.de")
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz)
    choix = ChoixQuestionFactory(question=question, est_correct=True)

    participation = ParticipationQuizFactory(quiz=quiz, membre=user.membre)
    from django.utils import timezone

    participation.terminee_le = timezone.now()
    participation.save(update_fields=["terminee_le"])

    resp = _auth(api_client, user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(choix.id)}
    )
    assert resp.status_code == 403


def test_classement_expose_le_top_et_ma_participation(api_client):
    quiz = QuizFactory()
    question = QuestionQuizFactory(quiz=quiz, points=100)
    bon_choix = ChoixQuestionFactory(question=question, est_correct=True)

    meilleur_user, meilleur_membre = _user_avec_membre(Role.MEMBRE, "quiz8@example.de")
    _auth(api_client, meilleur_user).post(_quiz_demarrer_url(quiz))
    _auth(api_client, meilleur_user).post(
        _quiz_repondre_url(quiz), {"question": str(question.id), "choix": str(bon_choix.id)}
    )

    observateur_user, _ = _user_avec_membre(Role.MEMBRE, "quiz9@example.de")
    resp = _auth(api_client, observateur_user).get(_quiz_classement_url(quiz))
    assert resp.status_code == 200
    assert len(resp.data["classement"]) == 1
    assert resp.data["classement"][0]["score"] == 100
    assert "ma_participation" not in resp.data  # cet observateur n'a pas participé


def test_creer_question_et_choix_reserve_au_bureau_admin(api_client):
    quiz = QuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "quiz10@example.de")
    resp = _auth(api_client, user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question ?"}
    )
    assert resp.status_code == 403

    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "quiz11@example.de")
    resp = _auth(api_client, admin_user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question ?"}
    )
    assert resp.status_code == 201
    question_id = resp.data["id"]

    resp = _auth(api_client, user).post(
        reverse(CHOIX_QUESTION_LIST_URL),
        {"question": question_id, "texte": "Réponse", "est_correct": True},
    )
    assert resp.status_code == 403

    resp = _auth(api_client, admin_user).post(
        reverse(CHOIX_QUESTION_LIST_URL),
        {"question": question_id, "texte": "Réponse", "est_correct": True},
    )
    assert resp.status_code == 201
    assert resp.data["est_correct"] is True


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — pages de gestion "Quiz-Verwaltung" (page_quiz) et
# "Fotoalben-Verwaltung" (page_albums) désormais pilotées par apps.rbac (real enforcement, y
# compris pour les rôles système eux-mêmes — voir apps.rbac.services.has_admin_page_access).
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


@pytest.mark.django_db
def test_phase_d_bureau_admin_perd_lacces_a_la_gestion_des_quiz_si_matrice_le_dit(api_client):
    """Nouveau (real enforcement) : contrairement à Phase B, une cellule de matrice peut
    désormais RETIRER un accès par défaut à un rôle système — ici Bureau Admin, qui gérait les
    quiz avant cette phase."""
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_quiz", NiveauAcces.AUCUN)
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-quiz-restrict@example.de")

    resp = _auth(api_client, admin_user).get(reverse(QUESTION_QUIZ_LIST_URL))
    assert resp.status_code == 403


@pytest.mark.django_db
def test_phase_d_role_personnalise_peut_gerer_les_quiz_via_la_matrice(api_client):
    """Contrepartie : un rôle qui n'avait jamais accès (Membre Normal) peut désormais gérer les
    quiz si la matrice le lui accorde explicitement. Utilise POST (comme
    test_creer_question_et_choix_reserve_au_bureau_admin) plutôt que GET : le GET sur cet
    endpoint bute sur un bug préexistant et hors-scope de pagination (CursorPagination par
    défaut trie sur "-created", un champ que QuestionQuiz n'a pas — jamais exercé par un GET
    avant cette phase, puisque seul le POST y était testé)."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    quiz = QuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-quiz-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="quiz-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_quiz", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    resp = _auth(api_client, user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question ?"}
    )
    assert resp.status_code == 201, resp.data


@pytest.mark.django_db
def test_phase_d_super_admin_gere_toujours_les_quiz_meme_si_matrice_dit_aucun(api_client):
    """L'Administrateur App reste hartcodé, indépendamment du contenu de la matrice. Voir
    docstring du test précédent pour le choix de POST plutôt que GET."""
    from apps.rbac.models import NiveauAcces

    quiz = QuizFactory()
    _set_matrice_cellule("super_admin", "page_quiz", NiveauAcces.AUCUN)
    admin_user, _ = _user_avec_membre(Role.SUPER_ADMIN, "phased-quiz-super@example.de")

    resp = _auth(api_client, admin_user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question ?"}
    )
    assert resp.status_code == 201, resp.data


@pytest.mark.django_db
def test_phase_d_bureau_admin_perd_lacces_a_la_gestion_des_albums_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_albums", NiveauAcces.AUCUN)
    admin_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-albums-restrict@example.de")

    resp = _auth(api_client, admin_user).post(reverse(ALBUM_LIST_URL), {"nom": "Derby 2026"})
    assert resp.status_code == 403


@pytest.mark.django_db
def test_phase_d_role_personnalise_peut_creer_un_album_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-albums-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="albums-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_albums", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    resp = _auth(api_client, user).post(reverse(ALBUM_LIST_URL), {"nom": "Derby 2026"})
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Phase D — distinction lecture/écriture réelle (2026-09-24) — apps.rbac.services.
# has_admin_page_access(required=...). Les tests Phase D ci-dessus couvrent le retrait/octroi
# TOTAL d'accès (AUCUN vs LECTURE_ECRITURE) ; ceux-ci couvrent spécifiquement LECTURE SEULE —
# le cas exact du bug original (retour utilisateur : un rôle avec seulement "Lesen" sur
# Quiz-Verwaltung pouvait quand même créer/modifier des quiz) — pour QuizPermission (l'objet
# Quiz lui-même, le bug original), GestionQuizPermission (questions/choix imbriqués),
# AlbumPermission et PhotoPermission.
# ---------------------------------------------------------------------------


def _assigner_role_perso(user, module_slug, niveau_acces):
    """Crée un rôle personnalisé, lui donne `niveau_acces` sur `module_slug`, et l'assigne à
    `user` — factorise le pattern répété par les tests Phase D ci-dessus (RoleDefinitionFactory
    + RoleModulePermissionFactory + UserRoleAssignmentFactory)."""
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    role_perso = RoleDefinitionFactory()
    RoleModulePermissionFactory(role=role_perso, module=module_slug, niveau_acces=niveau_acces)
    UserRoleAssignmentFactory(user=user, role=role_perso)
    return role_perso


# --- QuizPermission (objet Quiz lui-même — le bug original) ----------------------------


def test_phase_d_lecture_seule_page_quiz_permet_de_lister_les_quiz(api_client):
    """Lecture non régressée par l'introduction du niveau `lecture_ecriture` : un rôle avec
    seulement `lecture` sur page_quiz doit toujours pouvoir consulter la liste des quiz."""
    from apps.rbac.models import NiveauAcces

    QuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-quiz-read@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(reverse(QUIZ_LIST_URL))
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_quiz_refuse_creation_dun_quiz(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-quiz-write@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(reverse(QUIZ_LIST_URL), {"titre": "Quiz interdit"})
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_quiz_permet_de_creer_un_quiz(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-quiz-write-ok@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(reverse(QUIZ_LIST_URL), {"titre": "Quiz autorisé"})
    assert resp.status_code == 201
    assert resp.data["titre"] == "Quiz autorisé"


def test_phase_d_dir_financier_lecture_seule_page_quiz_ne_peut_pas_creer_de_quiz(api_client):
    """Reproduction LITTÉRALE du rapport utilisateur original : un Directeur Financier (rôle
    système, ROLE_LEVELS 4 — bien au-dessus de l'ancien seuil fixe MODERATION_MIN_LEVEL/Bureau
    Admin que QuizPermission utilisait avant le 2026-09-24) avec SEULEMENT `lecture` sur
    page_quiz via la matrice ne doit PAS pouvoir créer de quiz — voir docstring QuizPermission
    pour l'historique complet du bug (la cellule de la matrice n'avait jamais d'effet réel sur
    la création d'un Quiz avant cette correction)."""
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("dir_financier", "page_quiz", NiveauAcces.LECTURE)
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "phased-dirfin-quiz-bug@example.de")

    resp = _auth(api_client, user).post(
        reverse(QUIZ_LIST_URL), {"titre": "Quiz Directeur Financier"}
    )
    assert resp.status_code == 403


# --- GestionQuizPermission (QuestionQuiz/ChoixQuestion imbriqués) -----------------------


def test_phase_d_lecture_seule_page_quiz_permet_de_consulter_une_question(api_client):
    """GET sur le detail (pas le list — CursorPagination trie par défaut sur "-created", un
    champ que QuestionQuiz n'a pas, bug préexistant hors-scope de cette phase — voir
    test_phase_d_role_personnalise_peut_gerer_les_quiz_via_la_matrice ci-dessus pour le même
    contournement)."""
    from apps.rbac.models import NiveauAcces

    question = QuestionQuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-question-read@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(
        reverse("communaute:quiz-question-detail", args=[question.id])
    )
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_quiz_refuse_creation_dune_question(api_client):
    from apps.rbac.models import NiveauAcces

    quiz = QuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-question-write@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question interdite ?"}
    )
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_quiz_permet_de_creer_une_question(api_client):
    from apps.rbac.models import NiveauAcces

    quiz = QuizFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-question-write-ok@example.de")
    _assigner_role_perso(user, "page_quiz", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(
        reverse(QUESTION_QUIZ_LIST_URL), {"quiz": str(quiz.id), "texte": "Question autorisée ?"}
    )
    assert resp.status_code == 201


# --- AlbumPermission / PhotoPermission --------------------------------------------------


def test_phase_d_lecture_seule_page_albums_permet_de_lister_les_albums(api_client):
    from apps.rbac.models import NiveauAcces

    AlbumFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-albums-read@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(reverse(ALBUM_LIST_URL))
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_albums_refuse_creation_dun_album(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-albums-write@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(reverse(ALBUM_LIST_URL), {"nom": "Album interdit"})
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_albums_permet_de_creer_un_album(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-albums-write-ok@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(reverse(ALBUM_LIST_URL), {"nom": "Album autorisé"})
    assert resp.status_code == 201


def test_phase_d_lecture_seule_page_albums_refuse_upload_dune_photo(api_client):
    from apps.rbac.models import NiveauAcces

    album = AlbumFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-photo-write@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "legende": "Interdite", "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_albums_permet_upload_dune_photo(api_client):
    from apps.rbac.models import NiveauAcces

    album = AlbumFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-photo-write-ok@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(
        reverse(PHOTO_LIST_URL),
        {"album": str(album.id), "legende": "Autorisée", "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 201


def test_phase_d_lecture_seule_page_albums_refuse_masquer_une_photo(api_client):
    from apps.rbac.models import NiveauAcces

    photo = PhotoFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-photo-masquer@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(_photo_masquer_url(photo))
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_albums_permet_de_masquer_une_photo(api_client):
    from apps.rbac.models import NiveauAcces

    photo = PhotoFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-photo-masquer-ok@example.de")
    _assigner_role_perso(user, "page_albums", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(_photo_masquer_url(photo))
    assert resp.status_code == 200
    assert resp.data["est_masquee"] is True
