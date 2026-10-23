"""Die Migration 0003/0004 füllt die Quelle bestehender Einlass-Einträge aus ihrem Ticket."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

pytestmark = pytest.mark.django_db(transaction=True)


def test_bestehende_eintraege_bekommen_ihre_quelle_aus_dem_ticket():
    executor = MigrationExecutor(connection)
    executor.migrate([("eintritt", "0002_einlass")])
    apps_alt = executor.loader.project_state([("eintritt", "0002_einlass")]).apps
    Ticket = apps_alt.get_model("eintritt", "Eintrittsticket")
    Einlass = apps_alt.get_model("eintritt", "Einlass")
    from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
    from apps.membres.tests.factories import MembreFactory

    ins = InscriptionFactory(evenement=EvenementFactory(), membre=MembreFactory())
    ticket = Ticket.objects.create(inscription_id=ins.pk)
    eintrag = Einlass.objects.create(ticket_id=ticket.pk, erwachsene=1, kinder=0)

    executor = MigrationExecutor(connection)
    executor.migrate([("eintritt", "0004_einlass_quelle_pflicht")])
    apps_neu = executor.loader.project_state([("eintritt", "0004_einlass_quelle_pflicht")]).apps
    neu = apps_neu.get_model("eintritt", "Einlass").objects.get(pk=eintrag.pk)
    assert neu.inscription_id == ins.pk
    assert neu.teilnahme_id is None
