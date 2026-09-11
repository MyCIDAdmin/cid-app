import datetime

import pytest
from django.db import connection

from apps.accounts.models import User
from apps.membres.models import Membre, Sexe, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def test_numero_membre_auto_genere_au_premier_membre_de_l_annee():
    membre = MembreFactory(date_adhesion=datetime.date(2026, 1, 15))
    assert membre.numero_membre == "CA-2026-001"


def test_numero_membre_sequence_dans_la_meme_annee():
    m1 = MembreFactory(date_adhesion=datetime.date(2026, 3, 1))
    m2 = MembreFactory(date_adhesion=datetime.date(2026, 6, 1))
    m3 = MembreFactory(date_adhesion=datetime.date(2025, 6, 1))  # autre année — compteur séparé

    assert m1.numero_membre == "CA-2026-001"
    assert m2.numero_membre == "CA-2026-002"
    assert m3.numero_membre == "CA-2025-001"


def test_numero_membre_non_regenere_a_la_mise_a_jour():
    membre = MembreFactory(date_adhesion=datetime.date(2026, 1, 1))
    numero_initial = membre.numero_membre

    membre.ville_de = "Munich"
    membre.save()
    membre.refresh_from_db()

    assert membre.numero_membre == numero_initial


def test_str_format():
    membre = MembreFactory(prenom="Riadh", nom="Bchini", date_adhesion=datetime.date(2022, 1, 15))
    assert str(membre) == f"{membre.numero_membre} — Riadh Bchini"


def test_statut_par_defaut_en_attente():
    membre = Membre(
        prenom="Test",
        nom="Membre",
        date_naissance=datetime.date(1990, 1, 1),
        email="test@example.de",
        telephone="+49 170 0000000",
        cin="12345678",
        adresse_de="Teststr. 1",
        ville_de="Berlin",
    )
    assert membre.statut == StatutMembre.EN_ATTENTE
    assert membre.sexe == Sexe.NON_RENSEIGNE


def test_membre_peut_exister_sans_compte_utilisateur():
    """Import historique (RICEFW C-001) : la fiche Membre est créée avant tout compte User."""
    membre = MembreFactory(user=None)
    assert membre.user is None
    assert membre.pk is not None


def test_membre_lie_a_un_compte_utilisateur():
    user = User.objects.create_user(email="riadh.bchini@example.de", password="Password123!")
    membre = MembreFactory(user=user)
    assert membre.user_id == user.id
    assert user.membre == membre


def test_cin_et_passeport_sont_chiffres_en_base():
    """
    Le champ cin ne doit jamais apparaître en clair dans la table PostgreSQL — c'est tout
    l'intérêt de EncryptedCharField (AES-256-GCM, SCD §5.1). On vérifie ici la valeur brute
    stockée en base (hors ORM, qui déchiffre automatiquement à la lecture) pour s'assurer que
    ce n'est pas un simple CharField qui accepterait silencieusement le chiffrement.
    """
    cin_en_clair = "99887766"
    passeport_en_clair = "TN1234567"
    membre = MembreFactory(cin=cin_en_clair, passeport=passeport_en_clair)

    with connection.cursor() as cursor:
        cursor.execute("SELECT cin, passeport FROM membres WHERE id = %s", [str(membre.id)])
        cin_brut, passeport_brut = cursor.fetchone()

    assert cin_brut != cin_en_clair
    assert passeport_brut != passeport_en_clair

    # ... mais la lecture via l'ORM déchiffre correctement (round-trip).
    membre.refresh_from_db()
    assert membre.cin == cin_en_clair
    assert membre.passeport == passeport_en_clair


def test_passeport_optionnel():
    membre = MembreFactory(passeport=None)
    assert membre.passeport is None


def test_ordering_par_nom_prenom():
    MembreFactory(nom="Zribi", prenom="Ahmed")
    MembreFactory(nom="Bchini", prenom="Riadh")
    noms = list(Membre.objects.values_list("nom", flat=True))
    assert noms == sorted(noms)


# --- age() (AHM-19 : éligibilité d'âge des offres d'adhésion) ---


def test_age_anniversaire_deja_passe_cette_annee():
    aujourd_hui = datetime.date.today()
    naissance = aujourd_hui.replace(year=aujourd_hui.year - 25) - datetime.timedelta(days=10)
    membre = MembreFactory(date_naissance=naissance)
    assert membre.age == 25


def test_age_anniversaire_pas_encore_passe_cette_annee():
    aujourd_hui = datetime.date.today()
    naissance = aujourd_hui.replace(year=aujourd_hui.year - 25) + datetime.timedelta(days=10)
    membre = MembreFactory(date_naissance=naissance)
    assert membre.age == 24


def test_age_jour_anniversaire_exact():
    aujourd_hui = datetime.date.today()
    naissance = aujourd_hui.replace(year=aujourd_hui.year - 30)
    membre = MembreFactory(date_naissance=naissance)
    assert membre.age == 30
