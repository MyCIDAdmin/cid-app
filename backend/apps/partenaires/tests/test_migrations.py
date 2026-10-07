"""Migration 0002 : das frühere Freitextfeld `ansprechpartner` wird zum Hauptkontakt.

Die Datenfunktion läuft hier mit einfachen Attrappen statt mit einem MigrationExecutor: Ein
transaktionaler Migrationstest leert danach die Testdatenbank und bricht andere Tests (z. B. die
Websocket-Tests von apps.vote) in der Gesamtsuite."""

import importlib
from types import SimpleNamespace

MIGRATION = importlib.import_module(
    "apps.partenaires.migrations.0002_ausbau_kontakte_logo_dokumente_angebote"
)


class _Partner(SimpleNamespace):
    def save(self, update_fields=None):
        self.gespeichert = update_fields


class _Apps:
    def __init__(self, partner, kontakte):
        self._modelle = {
            "Partner": SimpleNamespace(
                objects=SimpleNamespace(
                    exclude=lambda ansprechpartner: [p for p in partner if p.ansprechpartner],
                    all=lambda: partner,
                )
            ),
            "PartnerKontakt": SimpleNamespace(
                objects=SimpleNamespace(
                    create=lambda **kw: kontakte.append(SimpleNamespace(**kw)),
                    filter=lambda partner: SimpleNamespace(
                        order_by=lambda *_: SimpleNamespace(
                            first=lambda: next((k for k in kontakte if k.partner is partner), None)
                        )
                    ),
                )
            ),
        }

    def get_model(self, _app, name):
        return self._modelle[name]


def test_ansprechpartner_wird_hauptkontakt():
    mit, ohne = _Partner(ansprechpartner="Max Muster"), _Partner(ansprechpartner="")
    kontakte = []
    MIGRATION.ansprechpartner_nach_kontakt(_Apps([mit, ohne], kontakte), None)
    assert len(kontakte) == 1
    assert kontakte[0].partner is mit
    assert kontakte[0].name == "Max Muster" and kontakte[0].hauptkontakt is True


def test_rueckwaerts_uebernimmt_den_ersten_kontakt():
    partner = _Partner(ansprechpartner="")
    kontakte = [SimpleNamespace(partner=partner, name="Anna", hauptkontakt=True)]
    MIGRATION.kontakt_nach_ansprechpartner(_Apps([partner], kontakte), None)
    assert partner.ansprechpartner == "Anna"
    assert partner.gespeichert == ["ansprechpartner"]
