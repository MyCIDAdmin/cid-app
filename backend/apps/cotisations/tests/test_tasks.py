"""
Tests — apps.cotisations.tasks (AHM-18, RICEFW W-001).

`mailoutbox` (fixture pytest-django) bascule automatiquement EMAIL_BACKEND sur le backend
locmem pour la durée du test : les settings dev pointent normalement vers un vrai serveur SMTP
(MailHog, config/settings/dev.py), injoignable dans cet environnement de test.
"""

from datetime import date

import pytest

from apps.accounts.models import Role, User
from apps.cotisations.models import (
    CheckpointRelance,
    RelanceCotisation,
    StatutCotisation,
    TypeArticle,
)
from apps.cotisations.tasks import _checkpoint_du_jour, envoyer_relances_cotisation
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _membre_avec_compte(langue="fr", statut=StatutMembre.ACTIF, email="membre@example.de"):
    user = User.objects.create_user(
        email=email,
        password="Password123!",
        role=Role.MEMBRE,
        is_active=True,
        langue_preferee=langue,
    )
    return MembreFactory(user=user, statut=statut)


# --- _checkpoint_du_jour ---


@pytest.mark.parametrize(
    "jour,attendu",
    [
        (date(2026, 12, 2), (CheckpointRelance.J_MOINS_30, 2027)),
        (date(2026, 12, 25), (CheckpointRelance.J_MOINS_7, 2027)),
        (date(2027, 1, 2), (CheckpointRelance.J_PLUS_1, 2027)),
        (date(2026, 6, 15), None),
        (date(2026, 12, 1), None),
        (date(2027, 1, 3), None),
    ],
)
def test_checkpoint_du_jour(jour, attendu):
    assert _checkpoint_du_jour(jour) == attendu


# --- envoyer_relances_cotisation ---


def test_jour_sans_checkpoint_ne_fait_rien(mailoutbox):
    _membre_avec_compte()

    resultat = envoyer_relances_cotisation(today=date(2026, 6, 15))

    assert resultat == {"checkpoint": None, "annee": None, "envoyes": 0}
    assert len(mailoutbox) == 0
    assert RelanceCotisation.objects.count() == 0


def test_membre_actif_sans_cotisation_payee_est_relance(mailoutbox):
    membre = _membre_avec_compte()

    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert resultat["envoyes"] == 1
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == [membre.user.email]
    assert "2027" in mailoutbox[0].subject
    log = RelanceCotisation.objects.get()
    assert log.membre == membre
    assert log.annee == 2027
    assert log.checkpoint == CheckpointRelance.J_MOINS_30


def test_membre_ayant_deja_paye_nest_pas_relance(mailoutbox):
    membre = _membre_avec_compte()
    CotisationFactory(
        membre=membre,
        type_article=TypeArticle.COTISATION,
        annee=2027,
        statut=StatutCotisation.PAYEE,
    )

    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert resultat["envoyes"] == 0
    assert len(mailoutbox) == 0


def test_membre_inactif_nest_pas_relance(mailoutbox):
    _membre_avec_compte(statut=StatutMembre.INACTIF)

    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert resultat["envoyes"] == 0
    assert len(mailoutbox) == 0


def test_membre_sans_compte_utilisateur_est_ignore(mailoutbox):
    MembreFactory(statut=StatutMembre.ACTIF)  # pas de user (fiche importée, RICEFW C-001)

    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert resultat["envoyes"] == 0
    assert len(mailoutbox) == 0


def test_idempotence_meme_jour_rejoue(mailoutbox):
    _membre_avec_compte()

    envoyer_relances_cotisation(today=date(2026, 12, 2))
    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert resultat["envoyes"] == 0
    assert len(mailoutbox) == 1
    assert RelanceCotisation.objects.count() == 1


def test_les_trois_checkpoints_relancent_a_nouveau_le_meme_membre(mailoutbox):
    # J-30 puis J-7 puis J+1 pour la même année : 3 relances distinctes, pas bloquées par
    # l'idempotence (qui ne s'applique qu'à un même (membre, annee, checkpoint)).
    _membre_avec_compte()

    envoyer_relances_cotisation(today=date(2026, 12, 2))
    envoyer_relances_cotisation(today=date(2026, 12, 25))
    envoyer_relances_cotisation(today=date(2027, 1, 2))

    assert len(mailoutbox) == 3
    assert RelanceCotisation.objects.count() == 3
    assert set(RelanceCotisation.objects.values_list("checkpoint", flat=True)) == {
        CheckpointRelance.J_MOINS_30,
        CheckpointRelance.J_MOINS_7,
        CheckpointRelance.J_PLUS_1,
    }


def test_email_en_allemand_si_preference_membre(mailoutbox):
    _membre_avec_compte(langue="de")

    envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert len(mailoutbox) == 1
    assert "Jahresbeitrag" in mailoutbox[0].subject


def test_email_en_francais_par_defaut_pour_preference_arabe(mailoutbox):
    # Pas de contenu AR pour ce module (R2, voir docstring tasks.py) — repli sur fr, même règle
    # que apps.cotisations.pdf._resoudre_langue.
    _membre_avec_compte(langue="ar")

    envoyer_relances_cotisation(today=date(2026, 12, 2))

    assert len(mailoutbox) == 1
    assert "Cotisation annuelle" in mailoutbox[0].subject


def test_cotisation_payee_pour_une_autre_annee_ne_bloque_pas_la_relance(mailoutbox):
    membre = _membre_avec_compte()
    CotisationFactory(
        membre=membre,
        type_article=TypeArticle.COTISATION,
        annee=2026,
        statut=StatutCotisation.PAYEE,
    )

    resultat = envoyer_relances_cotisation(today=date(2026, 12, 2))  # cible l'année 2027

    assert resultat["envoyes"] == 1
    assert len(mailoutbox) == 1
