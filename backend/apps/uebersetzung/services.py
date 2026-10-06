import hashlib

from django.contrib.contenttypes.models import ContentType

from . import deepl
from .models import SPRACHEN, Uebersetzung
from .registry import HTML_FELDER, UEBERSETZBAR, schluessel


def hash_von(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def felder_von(obj) -> list[str]:
    return UEBERSETZBAR.get(schluessel(obj), [])


def uebersetze_objekt(obj, *, erzwingen: bool = False) -> int:
    """Übersetzt alle registrierten Felder von `obj` in die fehlenden Sprachen. Eine vorhandene
    Übersetzung bleibt (auch eine manuell korrigierte), solange der Originaltext unverändert
    ist ; `erzwingen` übersetzt alles neu. Rückgabe: Anzahl neu geschriebener Übersetzungen."""
    if not deepl.ist_aktiv():
        return 0
    ct = ContentType.objects.get_for_model(obj)
    geschrieben = 0
    for feld in felder_von(obj):
        original = (getattr(obj, feld, "") or "").strip()
        vorhandene = {
            u.sprache: u
            for u in Uebersetzung.objects.filter(content_type=ct, objekt_id=str(obj.pk), feld=feld)
        }
        if not original:
            Uebersetzung.objects.filter(content_type=ct, objekt_id=str(obj.pk), feld=feld).delete()
            continue
        quell_hash = hash_von(original)
        aktuell = {s for s, u in vorhandene.items() if u.quell_hash == quell_hash and not erzwingen}
        for sprache in SPRACHEN:
            if sprache in aktuell:
                continue
            ergebnis = deepl.uebersetzen(original, sprache, html=feld in HTML_FELDER)
            if ergebnis is None:
                continue
            text, erkannt = ergebnis
            if erkannt == sprache:
                # Original ist bereits in dieser Sprache : Originaltext als "aktuell" vermerken,
                # damit bei der nächsten Speicherung kein weiterer API-Aufruf nötig ist.
                text = original
            Uebersetzung.objects.update_or_create(
                content_type=ct,
                objekt_id=str(obj.pk),
                feld=feld,
                sprache=sprache,
                defaults={"text": text, "quell_hash": quell_hash, "automatisch": True},
            )
            geschrieben += 1
    return geschrieben


def uebersetzungen_von(obj) -> dict:
    """{feld: {sprache: text}} — nur vorhandene, zum aktuellen Original passende Übersetzungen."""
    felder = felder_von(obj)
    if not felder:
        return {}
    ct = ContentType.objects.get_for_model(obj)
    ergebnis: dict = {}
    hashes = {f: hash_von((getattr(obj, f, "") or "").strip()) for f in felder}
    for u in Uebersetzung.objects.filter(content_type=ct, objekt_id=str(obj.pk), feld__in=felder):
        if u.quell_hash == hashes.get(u.feld) and u.text:
            ergebnis.setdefault(u.feld, {})[u.sprache] = u.text
    return ergebnis


def manuell_speichern(obj, feld: str, sprache: str, text: str) -> None:
    if feld not in felder_von(obj) or sprache not in SPRACHEN:
        raise ValueError("feld/sprache")
    original = (getattr(obj, feld, "") or "").strip()
    ct = ContentType.objects.get_for_model(obj)
    if not text.strip():
        Uebersetzung.objects.filter(
            content_type=ct, objekt_id=str(obj.pk), feld=feld, sprache=sprache
        ).delete()
        return
    Uebersetzung.objects.update_or_create(
        content_type=ct,
        objekt_id=str(obj.pk),
        feld=feld,
        sprache=sprache,
        defaults={"text": text, "quell_hash": hash_von(original), "automatisch": False},
    )
