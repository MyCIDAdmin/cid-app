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


def test_calculer_resultats_quorum_atteint():
    session = VoteSessionFactory(quorum_pct=50)
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.ACTIF)
    VoteExprime.objects.create(session=session, voter_token_hash=_rand_hash())
    resultats = calculer_resultats(session)
    assert resultats["taux_participation"] == 50.0
    assert resultats["quorum_atteint"] is True


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
