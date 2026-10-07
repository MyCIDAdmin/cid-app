"""Migration 0002 : das frühere Freitextfeld `ansprechpartner` wird zum Hauptkontakt."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

VOR = [("partenaires", "0001_initial")]
NACH = [("partenaires", "0003_planifier_erinnerungen_partner")]


@pytest.mark.django_db(transaction=True)
def test_ansprechpartner_wird_hauptkontakt():
    executor = MigrationExecutor(connection)
    executor.migrate(VOR)
    alt = executor.loader.project_state(VOR).apps
    alt.get_model("partenaires", "Partner").objects.create(nom="Mit Kontakt", ansprechpartner="Max")
    alt.get_model("partenaires", "Partner").objects.create(nom="Ohne Kontakt")

    executor = MigrationExecutor(connection)
    executor.migrate(NACH)
    neu = executor.loader.project_state(NACH).apps
    Partner = neu.get_model("partenaires", "Partner")
    Kontakt = neu.get_model("partenaires", "PartnerKontakt")
    kontakt = Kontakt.objects.get()
    assert kontakt.name == "Max" and kontakt.hauptkontakt is True
    assert kontakt.partner == Partner.objects.get(nom="Mit Kontakt")
    assert not Kontakt.objects.filter(partner__nom="Ohne Kontakt").exists()
