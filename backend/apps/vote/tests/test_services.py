"""Tests — apps.vote.services (éligibilité, agrégation des résultats, validation des choix)."""

import pytest

from apps.accounts.models import Role
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.vote.models import ChoixExprime, EligibiliteVote, TypeVote, VoteExprime
from apps.vote.services import calculer_resultats, membres_eligibles_qs, valider_choix_pour_type
from apps.vote.tests.factories import (
    VoteOptionCandidatFactory,
    VoteOptionFactory,
    VoteSessionFactory,
    user_membre_avec_fiche,
)

pytestmark = pytest.mark.django_db


def test_eligibilite_tous_actifs_exclut_les_inactifs():
    session = VoteSessionFactory(eligibilite=EligibiliteVote.TOUS_ACTIFS)
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.INACTIF)
    assert membres_eligibles_qs(session).count() == 1


def test_eligibilite_cotisants_ne_retient_que_les_membres_payes():
    session = VoteSessionFactory(eligibilite=EligibiliteVote.COTISANTS)
    membre_paye = MembreFactory(statut=StatutMembre.ACTIF)
    CotisationFactory(membre=membre_paye, annee=2026)
    MembreFactory(statut=StatutMembre.ACTIF)  # pas de cotisation
    resultat = membres_eligibles_qs(session)
    assert list(resultat) == [membre_paye]


def test_eligibilite_bureau_ne_retient_que_bureau_admin_et_plus():
    # Email volontairement distinct du format "bureau<n>@example.de" généré par la séquence
    # globale `_bureau_admin_seq` de factories.py (VoteSessionFactory ci-dessous en consomme
    # une valeur via user_bureau_admin()) — une collision déterministe avec un email codé en
    # dur ici a déjà été observée selon le nombre de VoteSessionFactory() créées avant ce test
    # dans le process pytest (IntegrityError sur users_email_key).
    session = VoteSessionFactory(eligibilite=EligibiliteVote.BUREAU)
    _, membre_normal = user_membre_avec_fiche(email="normal@example.de")
    user_bureau, membre_bureau = user_membre_avec_fiche(email="bureau-eligible@example.de")
    user_bureau.role = Role.BUREAU_ADMIN
    user_bureau.save(update_fields=["role"])
    resultat = membres_eligibles_qs(session)
    assert membre_bureau in resultat
    assert membre_normal not in resultat


def test_eligibilite_selection_manuelle():
    _, membre_selectionne = user_membre_avec_fiche(email="s1@example.de")
    _, membre_non_selectionne = user_membre_avec_fiche(email="s2@example.de")
    session = VoteSessionFactory(eligibilite=EligibiliteVote.SELECTION_MANUELLE)
    session.membres_selectionnes.add(membre_selectionne)
    resultat = membres_eligibles_qs(session)
    assert membre_selectionne in resultat
    assert membre_non_selectionne not in resultat


def test_calculer_resultats_compte_par_option_et_ignore_les_options_sans_vote():
    session = VoteSessionFactory()
    opt_a = VoteOptionFactory(session=session, label="A")
    opt_b = VoteOptionFactory(session=session, label="B")

    for _ in range(3):
        bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
        ChoixExprime.objects.create(bulletin=bulletin, option=opt_a)
    bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    ChoixExprime.objects.create(bulletin=bulletin, option=opt_b)

    resultats = calculer_resultats(session)
    assert resultats["total_participants"] == 4
    par_label = {r["label"]: r["nombre_voix"] for r in resultats["resultats"]}
    assert par_label["A"] == 3
    assert par_label["B"] == 1


def test_calculer_resultats_expose_la_composition_des_listes():
    session = VoteSessionFactory()
    opt_liste = VoteOptionFactory(session=session, label="Liste Renouveau")
    VoteOptionCandidatFactory(option=opt_liste, nom="Khaled Test", ordre=0)
    VoteOptionCandidatFactory(option=opt_liste, nom="Abir Test", ordre=1)
    VoteOptionFactory(session=session, label="Candidat indépendant")

    bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    ChoixExprime.objects.create(bulletin=bulletin, option=opt_liste)

    resultats = calculer_resultats(session)
    par_label = {r["label"]: r["candidats"] for r in resultats["resultats"]}
    assert par_label["Liste Renouveau"] == ["Khaled Test", "Abir Test"]
    assert par_label["Candidat indépendant"] == []


# --- Seuil de victoire (2026-09-25, renommage + changement de sémantique — voir docstring
# de VoteSession.seuil_victoire_pct/services.calculer_resultats : remplace l'ancien "quorum"
# de PARTICIPATION par un seuil sur la PART DES VOIX du gagnant, comparé STRICTEMENT (>),
# pas avec >=) ---


def test_calculer_resultats_sans_seuil_toujours_atteint():
    session = VoteSessionFactory(seuil_victoire_pct=None)
    bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    option = VoteOptionFactory(session=session)
    ChoixExprime.objects.create(bulletin=bulletin, option=option)

    resultats = calculer_resultats(session)

    assert resultats["seuil_victoire_requis"] is None
    assert resultats["seuil_victoire_atteint"] is True


def test_calculer_resultats_seuil_victoire_atteint_si_strictement_superieur():
    session = VoteSessionFactory(seuil_victoire_pct=50)
    option_a = VoteOptionFactory(session=session)
    VoteOptionFactory(session=session)
    # 2 voix sur 3 bulletins => 66,7% > 50% : seuil dépassé.
    for _ in range(2):
        bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
        ChoixExprime.objects.create(bulletin=bulletin, option=option_a)
    autre_bulletin = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    ChoixExprime.objects.create(bulletin=autre_bulletin, option=VoteOptionFactory(session=session))

    resultats = calculer_resultats(session)

    assert resultats["seuil_victoire_requis"] == 50
    assert resultats["seuil_victoire_atteint"] is True


def test_calculer_resultats_seuil_victoire_non_atteint_a_egalite_exacte():
    # Comparaison STRICTE (>) : un score exactement égal au seuil ne suffit PAS (correctif
    # explicite demandé par l'utilisateur — "aktuell ist = 50%", doit devenir "> 50%").
    session = VoteSessionFactory(seuil_victoire_pct=50)
    option_a = VoteOptionFactory(session=session)
    option_b = VoteOptionFactory(session=session)
    bulletin_a = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    ChoixExprime.objects.create(bulletin=bulletin_a, option=option_a)
    bulletin_b = VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    ChoixExprime.objects.create(bulletin=bulletin_b, option=option_b)

    resultats = calculer_resultats(session)

    assert resultats["seuil_victoire_requis"] == 50
    assert resultats["seuil_victoire_atteint"] is False


def test_calculer_resultats_seuil_victoire_non_atteint_sans_aucun_vote():
    session = VoteSessionFactory(seuil_victoire_pct=50)

    resultats = calculer_resultats(session)

    assert resultats["seuil_victoire_atteint"] is False


def test_calculer_resultats_ne_retourne_jamais_de_token():
    session = VoteSessionFactory()
    VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    resultats = calculer_resultats(session)
    assert "voter_token_hash" not in str(resultats)


@pytest.mark.parametrize(
    "type_vote,nb_choix_max,choix,doit_lever",
    [
        (TypeVote.UNIQUE, 1, ["a"], False),
        (TypeVote.UNIQUE, 1, ["a", "b"], True),
        (TypeVote.OUI_NON, 1, ["a"], False),
        (TypeVote.OUI_NON, 1, ["a", "b"], True),
        (TypeVote.MULTIPLE, 2, ["a", "b"], False),
        (TypeVote.MULTIPLE, 2, ["a", "b", "c"], True),
        (TypeVote.PREFERENTIEL, 1, ["a", "b", "c"], False),
        (TypeVote.UNIQUE, 1, [], True),
    ],
)
def test_valider_choix_pour_type(type_vote, nb_choix_max, choix, doit_lever):
    if doit_lever:
        with pytest.raises(ValueError):
            valider_choix_pour_type(type_vote, choix, nb_choix_max)
    else:
        valider_choix_pour_type(type_vote, choix, nb_choix_max)  # ne lève pas


def _rand_hash():
    import secrets

    return secrets.token_hex(32)
