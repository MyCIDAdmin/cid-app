import datetime
from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from apps.adhesions.models import (
    CampagneAdhesion,
    JustificatifRabais,
    OffreAdhesion,
    RabaisOffre,
    Souscription,
    StatutCampagne,
    StatutJustificatif,
    StatutSouscription,
    TypeRabais,
)
from apps.membres.tests.factories import MembreFactory


class CampagneAdhesionFactory(DjangoModelFactory):
    class Meta:
        model = CampagneAdhesion

    nom = factory.Sequence(lambda n: f"Campagne {2026 + n}")
    annee = factory.Sequence(lambda n: 2026 + n)
    date_debut = factory.LazyAttribute(lambda o: datetime.date(o.annee, 1, 1))
    date_fin = factory.LazyAttribute(lambda o: datetime.date(o.annee, 12, 31))
    statut = StatutCampagne.PUBLIEE
    created_by = factory.SubFactory(MembreFactory)


class OffreAdhesionFactory(DjangoModelFactory):
    class Meta:
        model = OffreAdhesion

    campagne = factory.SubFactory(CampagneAdhesionFactory)
    nom = "Offre Standard"
    prix_plein = Decimal("50.00")
    description = "Adhésion standard."
    avantages = factory.LazyFunction(
        lambda: [{"ordre": 1, "texte_fr": "Accès club", "texte_de": "Clubzugang", "texte_ar": ""}]
    )
    visible = True
    ordre = 0


class RabaisOffreFactory(DjangoModelFactory):
    class Meta:
        model = RabaisOffre

    offre = factory.SubFactory(OffreAdhesionFactory)
    type_rabais = TypeRabais.ETUDIANT
    label_fr = "Réduction étudiant"
    label_de = "Studentenrabatt"
    montant_reduction = Decimal("10.00")
    pct_reduction = None
    justificatif_requis = True
    instructions_fr = "Joindre une carte étudiante en cours de validité."


class SouscriptionFactory(DjangoModelFactory):
    class Meta:
        model = Souscription

    membre = factory.SubFactory(MembreFactory)
    offre = factory.SubFactory(OffreAdhesionFactory)
    campagne = factory.LazyAttribute(lambda o: o.offre.campagne)
    prix_paye = Decimal("50.00")
    statut = StatutSouscription.EN_ATTENTE_PAIEMENT
    snapshot_avantages = factory.LazyAttribute(lambda o: o.offre.avantages)


class JustificatifRabaisFactory(DjangoModelFactory):
    """
    Contourne délibérément l'upload API (voir test_justificatifs.py pour les tests qui
    exercent réellement JustificatifRabaisUploadSerializer.validate_fichier) : sert
    uniquement à préparer l'état pour les tests de liste/détail/téléchargement/validation,
    qui ne portent pas sur la validation MIME elle-même.
    """

    class Meta:
        model = JustificatifRabais

    souscription = factory.SubFactory(
        SouscriptionFactory, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    fichier = factory.django.FileField(filename="justificatif.pdf", data=b"%PDF-1.4 factory stub")
    statut = StatutJustificatif.EN_ATTENTE
