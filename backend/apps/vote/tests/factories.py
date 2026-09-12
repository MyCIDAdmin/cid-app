import itertools
from datetime import timedelta

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.accounts.models import Role, User
from apps.membres.tests.factories import MembreFactory
from apps.vote.models import ModeAnonymat, TypeVote, VoteOption, VoteSession
from apps.vote.security import generer_anonymat_sel

_bureau_admin_seq = itertools.count()


def user_bureau_admin(email=None):
    email = email or f"bureau{next(_bureau_admin_seq)}@example.de"
    return User.objects.create_user(
        email=email, password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )


def user_membre_avec_fiche(email="membre@example.de", **membre_kwargs):
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


class VoteSessionFactory(DjangoModelFactory):
    class Meta:
        model = VoteSession

    titre = factory.Sequence(lambda n: f"Vote {n}")
    description = "Description du vote."
    type_vote = TypeVote.UNIQUE
    mode_anonymat = ModeAnonymat.ANONYME
    nb_choix_max = 1
    duree_minutes = 30
    anonymat_sel = factory.LazyFunction(generer_anonymat_sel)
    created_by = factory.LazyFunction(user_bureau_admin)
    date_fin = factory.LazyFunction(lambda: timezone.now() + timedelta(minutes=30))


class VoteOptionFactory(DjangoModelFactory):
    class Meta:
        model = VoteOption

    session = factory.SubFactory(VoteSessionFactory)
    label = factory.Sequence(lambda n: f"Option {n}")
    ordre = 0
