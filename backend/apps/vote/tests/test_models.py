"""Tests — modèles app vote (contraintes d'unicité anti-doublon, propriété résultats_visibles)."""

import pytest
from django.db import IntegrityError

from apps.vote.models import ParticipationVote, StatutSession, VoteExprime
from apps.vote.tests.factories import VoteSessionFactory, user_membre_avec_fiche

pytestmark = pytest.mark.django_db


def test_resultats_visibles_false_tant_que_ouverte():
    session = VoteSessionFactory(statut=StatutSession.OUVERTE)
    assert session.resultats_visibles is False


def test_resultats_visibles_true_apres_cloture():
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    assert session.resultats_visibles is True


def test_un_seul_bulletin_par_token_et_session():
    session = VoteSessionFactory()
    VoteExprime.objects.create(session=session, voter_token_hash="a" * 64)
    with pytest.raises(IntegrityError):
        VoteExprime.objects.create(session=session, voter_token_hash="a" * 64)


def test_meme_token_accepte_sur_deux_sessions_differentes():
    """La contrainte d'unicité est bien (session, token) et non token seul."""
    session_a = VoteSessionFactory()
    session_b = VoteSessionFactory()
    VoteExprime.objects.create(session=session_a, voter_token_hash="b" * 64)
    VoteExprime.objects.create(session=session_b, voter_token_hash="b" * 64)  # ne lève pas


def test_une_seule_participation_nominative_par_membre_et_session():
    session = VoteSessionFactory()
    _, membre = user_membre_avec_fiche()
    ParticipationVote.objects.create(session=session, membre=membre)
    with pytest.raises(IntegrityError):
        ParticipationVote.objects.create(session=session, membre=membre)


def test_vote_exprime_ne_porte_aucune_reference_membre():
    """Vérification structurelle de l'anonymat (SCD §7.5) : le modèle VoteExprime n'a
    aucun champ pointant vers Membre ou User."""
    champs = {f.name for f in VoteExprime._meta.get_fields()}
    assert "membre" not in champs
    assert "user" not in champs
    assert "destinataire" not in champs
