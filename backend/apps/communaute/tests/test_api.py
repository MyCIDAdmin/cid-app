"""Tests API — app communaute, lot Fil d'actualité + Forum (CID-SCD-001 §résumé
"Forum / Fil — RBAC")."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import CategorieForum, Commentaire
from apps.communaute.tests.factories import (
    CommentaireFactory,
    PublicationFactory,
    ReponseForumFactory,
    SujetFactory,
)
from apps.membres.tests.factories import MembreFactory

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
