"""Migration 0003: Bestehende Einlass-Einträge bekommen ihre Quelle aus dem Ticket.

Die Datenfunktion läuft hier mit einfachen Attrappen statt mit einem MigrationExecutor: Ein
transaktionaler Migrationstest leert danach die Testdatenbank und bricht andere Tests (z. B. die
Websocket-Tests von apps.vote) in der Gesamtsuite."""

import importlib
from types import SimpleNamespace

MIGRATION = importlib.import_module("apps.eintritt.migrations.0003_anwesenheit_ohne_ticket")


class _Eintrag(SimpleNamespace):
    def save(self, update_fields=None):
        self.gespeichert = update_fields


class _Apps:
    def __init__(self, eintraege):
        self._eintraege = eintraege

    def get_model(self, app, name):
        assert (app, name) == ("eintritt", "Einlass")
        return SimpleNamespace(
            objects=SimpleNamespace(select_related=lambda *_: list(self._eintraege))
        )


def _eintrag(inscription_id=None, teilnahme_id=None):
    ticket = SimpleNamespace(inscription_id=inscription_id, teilnahme_id=teilnahme_id)
    return _Eintrag(ticket=ticket, inscription_id=None, teilnahme_id=None)


def test_bestehende_eintraege_bekommen_ihre_quelle_aus_dem_ticket():
    veranstaltung, treffen = _eintrag(inscription_id=7), _eintrag(teilnahme_id=9)
    MIGRATION.quelle_aus_ticket(_Apps([veranstaltung, treffen]), None)
    assert (veranstaltung.inscription_id, veranstaltung.teilnahme_id) == (7, None)
    assert (treffen.inscription_id, treffen.teilnahme_id) == (None, 9)
    assert veranstaltung.gespeichert == ["inscription", "teilnahme"]
