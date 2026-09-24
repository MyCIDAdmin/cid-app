"""Tests — module Tippspiel (pronostics Ligue 1, module Fan-Club, ajouté le 2026-09-24).

Deux volets : le calcul de points côté service (`services._points_tip`/
`recalculer_points_tippspiel`, voir docstring de tête pour le barème complet) et les
endpoints API (permissions — Administrateur App pour la gestion du jeu, Directeur
Financier+ pour la confirmation de paiement, IDOR sur les pronostics d'autrui —
périmètre Ligue 1 uniquement, date-limite 1 jour avant le coup d'envoi)."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute import services
from apps.communaute.models import (
    StatutPaiementTeilnahme,
    StatutRencontre,
    StatutTippspiel,
    TippspielTeilnahme,
    TippspielTip,
)
from apps.communaute.tests.factories import (
    RencontreCalendrierFactory,
    TippspielFactory,
    TippspielTeilnahmeFactory,
    TippspielTipFactory,
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


# ---------------------------------------------------------------------------
# Barème de points (services._points_tip) — voir docstring de tête services.py pour le
# détail complet des 4 branches.
# ---------------------------------------------------------------------------


def test_points_resultat_exact():
    assert services._points_tip(2, 1, 2, 1) == 4


def test_points_tordifference_correcte_victoire():
    # Tip 2:0 (victoire domicile, différence +2), résultat 3:1 (victoire domicile,
    # différence +2 aussi) — exemple donné mot pour mot par l'utilisateur.
    assert services._points_tip(2, 0, 3, 1) == 2


def test_points_tordifference_correcte_defaite():
    assert services._points_tip(0, 2, 1, 3) == 2


def test_points_tendance_correcte_seule_victoire():
    # Bon vainqueur (domicile), mauvaise différence de buts.
    assert services._points_tip(1, 0, 3, 0) == 1


def test_points_tendance_correcte_seule_nul_mais_score_different():
    # Un nul correctement deviné (tendance=0 des deux côtés) mais un score exact
    # différent NE DOIT PAS tomber dans la branche "tordifférence" (qui exige un
    # vainqueur, qu'un nul n'a par définition pas) — seulement 1 point, pas 2.
    assert services._points_tip(0, 0, 1, 1) == 1


def test_points_tendance_incorrecte():
    assert services._points_tip(2, 0, 0, 1) == 0


def test_points_nul_predit_mais_victoire_reelle():
    assert services._points_tip(1, 1, 2, 1) == 0


# ---------------------------------------------------------------------------
# recalculer_points_tippspiel (déclenché après chaque sync GOAL API, jamais en direct)
# ---------------------------------------------------------------------------


def test_recalculer_points_ne_touche_que_les_rencontres_ligue1_terminees():
    rencontre_terminee_ligue1 = RencontreCalendrierFactory(
        competition="Ligue 1",
        statut=StatutRencontre.TERMINEE,
        score_domicile=2,
        score_exterieur=1,
    )
    rencontre_programmee = RencontreCalendrierFactory(
        competition="Ligue 1", statut=StatutRencontre.PROGRAMMEE
    )
    rencontre_autre_competition = RencontreCalendrierFactory(
        competition="Coupe de Tunisie",
        statut=StatutRencontre.TERMINEE,
        score_domicile=1,
        score_exterieur=0,
    )

    tip_a_noter = TippspielTipFactory(
        rencontre=rencontre_terminee_ligue1, score_domicile=2, score_exterieur=1
    )
    tip_pas_encore_joue = TippspielTipFactory(
        rencontre=rencontre_programmee, score_domicile=1, score_exterieur=0
    )
    tip_hors_perimetre = TippspielTipFactory(
        rencontre=rencontre_autre_competition, score_domicile=1, score_exterieur=0
    )

    total = services.recalculer_points_tippspiel()

    tip_a_noter.refresh_from_db()
    tip_pas_encore_joue.refresh_from_db()
    tip_hors_perimetre.refresh_from_db()

    assert tip_a_noter.points == 4
    assert tip_pas_encore_joue.points is None
    assert tip_hors_perimetre.points is None
    assert total == 1


def test_recalculer_points_est_idempotent_et_corrige_un_score_tardif():
    rencontre = RencontreCalendrierFactory(
        competition="Ligue 1",
        statut=StatutRencontre.TERMINEE,
        score_domicile=2,
        score_exterieur=1,
    )
    tip = TippspielTipFactory(rencontre=rencontre, score_domicile=2, score_exterieur=1)

    premier_total = services.recalculer_points_tippspiel()
    tip.refresh_from_db()
    assert tip.points == 4
    assert premier_total == 1

    # Rappel sans rien changer : aucune ligne à mettre à jour.
    deuxieme_total = services.recalculer_points_tippspiel()
    assert deuxieme_total == 0

    # Correction tardive du score côté GOAL API (rare mais possible) : recalculé. Tip
    # 2:1 (domicile, différence +1) vs résultat corrigé 3:1 (domicile, différence +2) —
    # même vainqueur mais différence de buts désormais différente : tendance seule (1
    # point), l'exact-score (4) et la tordifférence (2) sont tous deux perdus.
    rencontre.score_domicile = 3
    rencontre.save(update_fields=["score_domicile"])
    troisieme_total = services.recalculer_points_tippspiel()
    tip.refresh_from_db()
    assert tip.points == 1
    assert troisieme_total == 1


def test_recalculer_points_sans_tippspiel_ne_fait_rien():
    assert services.recalculer_points_tippspiel() == 0


# ---------------------------------------------------------------------------
# API — gestion du Tippspiel (Administrateur App exclusivement)
# ---------------------------------------------------------------------------

TIPPSPIEL_LIST_URL = "communaute:tippspiel-list"


def _tippspiel_detail_url(pk):
    return reverse("communaute:tippspiel-detail", args=[pk])


def test_creation_tippspiel_reservee_a_lapp_admin(api_client):
    admin, _ = _user_avec_membre(Role.SUPER_ADMIN, "tp-admin@example.de")
    payload = {
        "titre": "Tippspiel Ligue 1 2026/2027",
        "saison": "2026-2027",
        "regles": "4/2/1/0 points.",
        "statut": "publie",
        "prix": [
            {"platz": 1, "type_prix": "montant_fixe", "montant": "100.00"},
            {"platz": 2, "type_prix": "pourcentage", "pourcentage": "30.00"},
        ],
    }
    resp = _auth(api_client, admin).post(reverse(TIPPSPIEL_LIST_URL), payload, format="json")
    assert resp.status_code == 201
    assert resp.data["titre"] == "Tippspiel Ligue 1 2026/2027"
    assert len(resp.data["prix"]) == 2


def test_creation_tippspiel_refusee_a_bureau_admin(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "tp-bureau@example.de")
    payload = {"titre": "X", "saison": "2026-2027", "statut": "brouillon"}
    resp = _auth(api_client, user).post(reverse(TIPPSPIEL_LIST_URL), payload, format="json")
    assert resp.status_code == 403


def test_creation_tippspiel_refusee_a_dir_financier(api_client):
    # Décision utilisateur explicite : Administrateur App SEUL, pas Directeur Financier
    # malgré son niveau élevé — voir docstring de tête TippspielPermission.
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "tp-dirfin@example.de")
    payload = {"titre": "X", "saison": "2026-2027", "statut": "brouillon"}
    resp = _auth(api_client, user).post(reverse(TIPPSPIEL_LIST_URL), payload, format="json")
    assert resp.status_code == 403


def test_tippspiel_brouillon_invisible_a_un_membre_standard(api_client):
    admin, _ = _user_avec_membre(Role.SUPER_ADMIN, "tp-admin2@example.de")
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "tp-membre1@example.de")
    TippspielFactory(statut=StatutTippspiel.BROUILLON, titre="Brouillon caché")
    TippspielFactory(statut=StatutTippspiel.PUBLIE, titre="Publié visible")

    resp_membre = _auth(api_client, membre_user).get(reverse(TIPPSPIEL_LIST_URL))
    titres_membre = [t["titre"] for t in resp_membre.data["results"]]
    assert "Brouillon caché" not in titres_membre
    assert "Publié visible" in titres_membre

    resp_admin = _auth(api_client, admin).get(reverse(TIPPSPIEL_LIST_URL))
    titres_admin = [t["titre"] for t in resp_admin.data["results"]]
    assert "Brouillon caché" in titres_admin


# ---------------------------------------------------------------------------
# API — teilnehmen / confirmer-paiement
# ---------------------------------------------------------------------------


def test_teilnehmen_jeu_gratuit_confirme_immediatement(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-join1@example.de")
    tippspiel = TippspielFactory(montant_participation=None)

    resp = _auth(api_client, user).post(_tippspiel_detail_url(tippspiel.id) + "teilnehmen/")

    assert resp.status_code == 200
    assert resp.data["statut_paiement"] == "sans_frais"
    teilnahme = TippspielTeilnahme.objects.get(tippspiel=tippspiel)
    assert teilnahme.est_confirmee is True


def test_teilnehmen_jeu_payant_reste_en_attente(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-join2@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")

    resp = _auth(api_client, user).post(_tippspiel_detail_url(tippspiel.id) + "teilnehmen/")

    assert resp.status_code == 200
    assert resp.data["statut_paiement"] == "en_attente"
    teilnahme = TippspielTeilnahme.objects.get(tippspiel=tippspiel)
    assert teilnahme.est_confirmee is False


def test_teilnehmen_est_idempotent(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-join3@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    client = _auth(api_client, user)

    client.post(_tippspiel_detail_url(tippspiel.id) + "teilnehmen/")
    client.post(_tippspiel_detail_url(tippspiel.id) + "teilnehmen/")

    assert TippspielTeilnahme.objects.filter(tippspiel=tippspiel).count() == 1


def test_confirmer_paiement_reserve_au_directeur_financier(api_client):
    bureau_user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "tp-confirm-bad@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    teilnahme = TippspielTeilnahmeFactory(
        tippspiel=tippspiel, statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE
    )

    resp = _auth(api_client, bureau_user).post(
        reverse("communaute:tippspiel-teilnahme-confirmer-paiement", args=[teilnahme.id])
    )
    assert resp.status_code == 403


def test_confirmer_paiement_par_directeur_financier(api_client):
    dirfin_user, _ = _user_avec_membre(Role.DIR_FINANCIER, "tp-confirm-ok@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    teilnahme = TippspielTeilnahmeFactory(
        tippspiel=tippspiel, statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE
    )

    resp = _auth(api_client, dirfin_user).post(
        reverse("communaute:tippspiel-teilnahme-confirmer-paiement", args=[teilnahme.id])
    )

    assert resp.status_code == 200
    teilnahme.refresh_from_db()
    assert teilnahme.statut_paiement == StatutPaiementTeilnahme.CONFIRMEE
    assert teilnahme.confirmee_par == dirfin_user
    assert teilnahme.confirmee_le is not None


def test_confirmer_paiement_refuse_si_jeu_gratuit(api_client):
    dirfin_user, _ = _user_avec_membre(Role.DIR_FINANCIER, "tp-confirm-free@example.de")
    teilnahme = TippspielTeilnahmeFactory(statut_paiement=StatutPaiementTeilnahme.SANS_FRAIS)

    resp = _auth(api_client, dirfin_user).post(
        reverse("communaute:tippspiel-teilnahme-confirmer-paiement", args=[teilnahme.id])
    )
    assert resp.status_code == 400


def test_liste_paiements_en_attente_reservee_au_directeur_financier(api_client):
    membre_user, _ = _user_avec_membre(Role.MEMBRE, "tp-pending-membre@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    TippspielTeilnahmeFactory(
        tippspiel=tippspiel, statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE
    )

    resp = _auth(api_client, membre_user).get(
        reverse("communaute:tippspiel-teilnahme-list")
        + f"?tippspiel={tippspiel.id}&statut_paiement=en_attente"
    )
    assert resp.status_code == 403


def test_liste_paiements_en_attente_pour_le_directeur_financier(api_client):
    dirfin_user, _ = _user_avec_membre(Role.DIR_FINANCIER, "tp-pending-dirfin@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    membre_en_attente = MembreFactory(prenom="Léa", nom="Attente")
    en_attente = TippspielTeilnahmeFactory(
        tippspiel=tippspiel,
        membre=membre_en_attente,
        statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE,
    )
    # Une participation déjà confirmée ne doit pas apparaître dans cette liste (déjà traitée).
    TippspielTeilnahmeFactory(
        tippspiel=tippspiel, statut_paiement=StatutPaiementTeilnahme.CONFIRMEE
    )

    resp = _auth(api_client, dirfin_user).get(
        reverse("communaute:tippspiel-teilnahme-list")
        + f"?tippspiel={tippspiel.id}&statut_paiement=en_attente"
    )

    assert resp.status_code == 200
    ids = [ligne["id"] for ligne in resp.data["results"]]
    assert ids == [str(en_attente.id)]


def test_liste_paiements_en_attente_couvre_tous_les_tippspiele_sans_filtre(api_client):
    # Retour utilisateur du 2026-09-24 : la confirmation doit se faire depuis le module
    # "Ausstehende Zahlungen", pas depuis le module Fan-Club — ce module ne connaît a
    # priori pas l'id d'un Tippspiel particulier, `?tippspiel=` devient donc optionnel
    # pour cette branche (voir TippspielTeilnahmeViewSet.get_queryset).
    dirfin_user, _ = _user_avec_membre(Role.DIR_FINANCIER, "tp-pending-all@example.de")
    tippspiel_a = TippspielFactory(titre="Tippspiel A", montant_participation="10.00")
    tippspiel_b = TippspielFactory(titre="Tippspiel B", montant_participation="5.00")
    en_attente_a = TippspielTeilnahmeFactory(
        tippspiel=tippspiel_a, statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE
    )
    en_attente_b = TippspielTeilnahmeFactory(
        tippspiel=tippspiel_b, statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE
    )

    resp = _auth(api_client, dirfin_user).get(
        reverse("communaute:tippspiel-teilnahme-list") + "?statut_paiement=en_attente"
    )

    assert resp.status_code == 200
    ids = {ligne["id"] for ligne in resp.data["results"]}
    assert ids == {str(en_attente_a.id), str(en_attente_b.id)}
    ligne_a = next(ligne for ligne in resp.data["results"] if ligne["id"] == str(en_attente_a.id))
    assert ligne_a["tippspiel_titre"] == str(tippspiel_a)
    assert ligne_a["montant_participation"] == "10.00"


# ---------------------------------------------------------------------------
# API — pronostics (TippspielTip) : périmètre Ligue 1, date-limite, IDOR
# ---------------------------------------------------------------------------

TIPPSPIEL_TIP_LIST_URL = "communaute:tippspiel-tip-list"


def _rencontre_dans_3_jours(**overrides):
    kwargs = {
        "competition": "Ligue 1",
        "statut": StatutRencontre.PROGRAMMEE,
        "date_heure": timezone.now() + timedelta(days=3),
    }
    kwargs.update(overrides)
    return RencontreCalendrierFactory(**kwargs)


def test_creer_un_pronostic_cree_automatiquement_la_participation(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "tp-tip1@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    rencontre = _rencontre_dans_3_jours()

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre.id),
            "score_domicile": 2,
            "score_exterieur": 1,
        },
        format="json",
    )

    assert resp.status_code == 201
    assert TippspielTeilnahme.objects.filter(tippspiel=tippspiel, membre=membre).exists()
    tip = TippspielTip.objects.get(teilnahme__membre=membre, rencontre=rencontre)
    assert (tip.score_domicile, tip.score_exterieur) == (2, 1)
    assert tip.points is None  # pas encore joué


def test_pronostic_refuse_pour_jeu_payant_tant_que_paiement_non_confirme(api_client):
    # Retour utilisateur du 2026-09-24 : "Für Beitragspflichtige Spiele, müssen Tipps
    # verfügbar sein, nachdem die Bezahlung bestätigt wird" — la participation est bien
    # auto-créée (même comportement qu'avant), mais le pronostic lui-même est refusé.
    user, membre = _user_avec_membre(Role.MEMBRE, "tp-tip-non-confirme@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    rencontre = _rencontre_dans_3_jours()

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre.id),
            "score_domicile": 2,
            "score_exterieur": 1,
        },
        format="json",
    )

    assert resp.status_code == 400
    teilnahme = TippspielTeilnahme.objects.get(tippspiel=tippspiel, membre=membre)
    assert teilnahme.statut_paiement == StatutPaiementTeilnahme.EN_ATTENTE
    assert not TippspielTip.objects.filter(teilnahme=teilnahme).exists()


def test_pronostic_autorise_pour_jeu_payant_une_fois_le_paiement_confirme(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "tp-tip-confirme@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")
    TippspielTeilnahmeFactory(
        tippspiel=tippspiel, membre=membre, statut_paiement=StatutPaiementTeilnahme.CONFIRMEE
    )
    rencontre = _rencontre_dans_3_jours()

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre.id),
            "score_domicile": 2,
            "score_exterieur": 1,
        },
        format="json",
    )

    assert resp.status_code == 201


def test_pronostic_refuse_hors_ligue1(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-tip2@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    rencontre_coupe = _rencontre_dans_3_jours(competition="Coupe de Tunisie")

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre_coupe.id),
            "score_domicile": 1,
            "score_exterieur": 0,
        },
        format="json",
    )
    assert resp.status_code == 400


def test_pronostic_refuse_apres_la_date_limite(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-tip3@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    # Coup d'envoi dans 12h : moins d'un jour, donc au-delà de la date-limite.
    rencontre_proche = _rencontre_dans_3_jours(date_heure=timezone.now() + timedelta(hours=12))

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre_proche.id),
            "score_domicile": 1,
            "score_exterieur": 0,
        },
        format="json",
    )
    assert resp.status_code == 400


def test_pronostic_refuse_si_rencontre_deja_terminee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-tip4@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    rencontre_jouee = RencontreCalendrierFactory(
        competition="Ligue 1",
        statut=StatutRencontre.TERMINEE,
        score_domicile=1,
        score_exterieur=1,
    )

    resp = _auth(api_client, user).post(
        reverse(TIPPSPIEL_TIP_LIST_URL),
        {
            "tippspiel": str(tippspiel.id),
            "rencontre": str(rencontre_jouee.id),
            "score_domicile": 1,
            "score_exterieur": 0,
        },
        format="json",
    )
    assert resp.status_code == 400


def test_un_membre_ne_voit_jamais_les_pronostics_dun_autre(api_client):
    user_a, membre_a = _user_avec_membre(Role.MEMBRE, "tp-idor-a@example.de")
    user_b, membre_b = _user_avec_membre(Role.MEMBRE, "tp-idor-b@example.de")
    tippspiel = TippspielFactory(montant_participation=None)
    teilnahme_a = TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre_a)
    teilnahme_b = TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre_b)
    TippspielTipFactory(teilnahme=teilnahme_a)
    tip_b = TippspielTipFactory(teilnahme=teilnahme_b)

    resp = _auth(api_client, user_a).get(reverse(TIPPSPIEL_TIP_LIST_URL))
    ids_visibles = [t["id"] for t in resp.data["results"]]
    assert str(tip_b.id) not in ids_visibles

    # Deuxième ligne de défense : accès direct à l'objet d'autrui également refusé.
    resp_detail = _auth(api_client, user_a).patch(
        reverse("communaute:tippspiel-tip-detail", args=[tip_b.id]),
        {"score_domicile": 9, "score_exterieur": 9},
        format="json",
    )
    assert resp_detail.status_code == 404


def test_non_authentifie_refuse_sur_les_trois_endpoints(api_client):
    tippspiel = TippspielFactory()
    assert api_client.get(reverse(TIPPSPIEL_LIST_URL)).status_code == 401
    assert (
        api_client.get(reverse(TIPPSPIEL_TIP_LIST_URL) + f"?tippspiel={tippspiel.id}").status_code
        == 401
    )
    assert (
        api_client.get(
            reverse("communaute:tippspiel-teilnahme-list") + f"?tippspiel={tippspiel.id}"
        ).status_code
        == 401
    )


# ---------------------------------------------------------------------------
# API — classement (uniquement les participations confirmées)
# ---------------------------------------------------------------------------


def test_classement_exclut_les_participations_non_confirmees(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "tp-class1@example.de")
    tippspiel = TippspielFactory(montant_participation="10.00")

    membre_confirme = MembreFactory(prenom="Aya", nom="Confirmée")
    teilnahme_confirmee = TippspielTeilnahmeFactory(
        tippspiel=tippspiel,
        membre=membre_confirme,
        statut_paiement=StatutPaiementTeilnahme.CONFIRMEE,
    )
    rencontre = RencontreCalendrierFactory(
        competition="Ligue 1",
        statut=StatutRencontre.TERMINEE,
        score_domicile=2,
        score_exterieur=1,
    )
    TippspielTipFactory(
        teilnahme=teilnahme_confirmee, rencontre=rencontre, score_domicile=2, score_exterieur=1
    )
    services.recalculer_points_tippspiel()

    membre_en_attente = MembreFactory(prenom="Ben", nom="EnAttente")
    TippspielTeilnahmeFactory(
        tippspiel=tippspiel,
        membre=membre_en_attente,
        statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE,
    )

    resp = _auth(api_client, user).get(
        reverse("communaute:tippspiel-teilnahme-list") + f"?tippspiel={tippspiel.id}"
    )

    assert resp.status_code == 200
    noms = [ligne["membre_nom"] for ligne in resp.data["results"]]
    assert "Aya Confirmée" in noms
    assert "Ben EnAttente" not in noms
    ligne_confirmee = next(
        ligne for ligne in resp.data["results"] if ligne["membre_nom"] == "Aya Confirmée"
    )
    assert ligne_confirmee["total_points"] == 4
