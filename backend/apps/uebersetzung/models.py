"""Gespeicherte Übersetzungen von Beschreibungstexten (Nutzerwunsch 2026-10-06 : "Bei den
Beschreibungen in den Modulen ein Übersetzungstool integrieren, damit die Beschreibungen
automatisch in der ausgewählten Sprache angezeigt werden").

Die Texte der Verwaltung stehen in EINER Sprache im jeweiligen Modell (Projekt, Veranstaltung,
Produkt, ...). Beim Speichern übersetzt DeepL sie in die übrigen Sprachen (de/fr/ar) ; das
Ergebnis wird hier gespeichert (nicht bei jedem Aufruf neu übersetzt) und kann von der
Verwaltung manuell korrigiert werden (`automatisch=False`). `quell_hash` hält fest, zu welchem
Originaltext die Übersetzung gehört — ändert sich der Originaltext, wird neu übersetzt."""

from django.contrib.contenttypes.models import ContentType
from django.db import models

SPRACHEN = ("de", "fr", "ar")


class Uebersetzung(models.Model):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    objekt_id = models.CharField(max_length=64)
    feld = models.CharField(max_length=50)
    sprache = models.CharField(max_length=2)
    text = models.TextField(blank=True)
    quell_hash = models.CharField(max_length=64)
    automatisch = models.BooleanField(default=True)
    aktualisiert = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "uebersetzung_uebersetzung"
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "objekt_id", "feld", "sprache"],
                name="uebersetzung_eindeutig",
            )
        ]
        indexes = [
            models.Index(fields=["content_type", "objekt_id"], name="uebersetzung_objekt_idx")
        ]

    def __str__(self):
        return f"{self.content_type_id}:{self.objekt_id}.{self.feld}[{self.sprache}]"
