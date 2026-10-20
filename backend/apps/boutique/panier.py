"""Warenkorb-Reservierung im Shop (2026-10-20).

Sobald jemand einen Artikel in den Warenkorb legt, wird die Menge für `warenkorb_reservierung_
minuten` (zentral einstellbar, Standard 20) zurückgelegt. Der Lagerstand für alle anderen ist
`stock − fremde aktive Reservierungen` ; die eigene Reservierung zählt für einen selbst nicht
ab. Jede Änderung am Warenkorb (Artikel hinzufügen, Menge ändern) setzt den Countdown für den
ganzen Warenkorb zurück. Läuft er ab, sind die Mengen sofort wieder frei (Filter auf
`expire_le`, unabhängig von Celery).

Alle Prüfungen laufen unter Zeilensperre der Varianten (CLAUDE.md §8), in stabiler Reihenfolge
(nach id) wie `CommandeViewSet.passer`.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.zentral.models import ZentraleEinstellungen

from .models import PanierReservierung, TypeProduit, VarianteProduit


def _aktive():
    return PanierReservierung.objects.filter(expire_le__gt=timezone.now())


def fremde_reservierte_menge(variante_id, membre=None) -> int:
    """Menge, die andere (nicht `membre`) gerade im Warenkorb haben."""
    qs = _aktive().filter(variante_id=variante_id)
    if membre is not None:
        qs = qs.exclude(membre=membre)
    return qs.aggregate(t=Sum("quantite"))["t"] or 0


def verfuegbarer_bestand(variante: VarianteProduit, membre=None) -> int:
    """Lagerstand abzüglich der Warenkörbe anderer (für `membre`: die eigene Reservierung
    zählt nicht ab)."""
    return max(variante.stock - fremde_reservierte_menge(variante.id, membre), 0)


def bestandskarte(membre=None) -> dict:
    """{variante_id: Menge in Warenkörben ANDERER} für alle aktiven Reservierungen — eine
    einzige Abfrage pro Request, für die Serialisierung ganzer Kataloglisten."""
    qs = _aktive()
    if membre is not None:
        qs = qs.exclude(membre=membre)
    return {
        zeile["variante_id"]: zeile["summe"]
        for zeile in qs.values("variante_id").annotate(summe=Sum("quantite"))
    }


def dauer() -> timedelta:
    return timedelta(minutes=ZentraleEinstellungen.get_solo().warenkorb_reservierung_minuten)


def max_erneuerungen() -> int:
    """Wie oft eine abgelaufene Reservierung erneuert werden darf, bevor der Warenkorb geleert
    wird (zentral einstellbar). Die Zählung selbst macht die Oberfläche je Sitzung."""
    return ZentraleEinstellungen.get_solo().warenkorb_max_erneuerungen


def status(membre) -> dict:
    """Aktueller Stand der eigenen Reservierung (für die Anzeige des Countdowns)."""
    zeilen = list(_aktive().filter(membre=membre).select_related("variante"))
    if not zeilen:
        return {
            "expire_le": None,
            "restzeit_sekunden": 0,
            "max_erneuerungen": max_erneuerungen(),
            "zeilen": [],
        }
    ende = max(z.expire_le for z in zeilen)
    return {
        "expire_le": ende,
        "restzeit_sekunden": max(int((ende - timezone.now()).total_seconds()), 0),
        "max_erneuerungen": max_erneuerungen(),
        "zeilen": [
            {"variante": str(z.variante_id), "reserviert": z.quantite, "verfuegbar": z.quantite}
            for z in zeilen
        ],
    }


def reserviere_warenkorb(membre, zeilen: list[dict]) -> dict:
    """Setzt die Reservierung des Mitglieds auf genau `zeilen` ([{"variante": VarianteProduit,
    "quantite": int}]) und startet den Countdown neu. Reserviert pro Zeile höchstens, was für
    das Mitglied verfügbar ist (Teilreservierung statt Fehler) ; die Antwort nennt je Zeile
    `reserviert` und `verfuegbar`, damit die Oberfläche die Menge anpassen kann. Zeilen, die nicht
    mehr im Warenkorb stehen, werden freigegeben. Gutscheine (kein Lagerbestand) werden ignoriert.
    """
    gewuenscht: dict = {}
    for zeile in zeilen:
        variante = zeile["variante"]
        if variante.produit.type_produit == TypeProduit.BON_ACHAT:
            continue
        gewuenscht[variante.id] = gewuenscht.get(variante.id, 0) + zeile["quantite"]

    ende = timezone.now() + dauer()
    ergebnis = []
    with transaction.atomic():
        gesperrt = {
            v.id: v
            for v in VarianteProduit.objects.select_for_update()
            .filter(id__in=sorted(gewuenscht))
            .order_by("id")
        }
        PanierReservierung.objects.filter(membre=membre).exclude(
            variante_id__in=list(gewuenscht)
        ).delete()
        for variante_id in sorted(gewuenscht):
            variante = gesperrt[variante_id]
            verfuegbar = verfuegbarer_bestand(variante, membre)
            reserviert = min(gewuenscht[variante_id], verfuegbar)
            if reserviert > 0:
                PanierReservierung.objects.update_or_create(
                    membre=membre,
                    variante=variante,
                    defaults={"quantite": reserviert, "expire_le": ende},
                )
            else:
                PanierReservierung.objects.filter(membre=membre, variante=variante).delete()
            ergebnis.append(
                {
                    "variante": str(variante_id),
                    "reserviert": reserviert,
                    "verfuegbar": verfuegbar,
                }
            )
    hat_reservierung = any(z["reserviert"] for z in ergebnis)
    return {
        "expire_le": ende if hat_reservierung else None,
        "restzeit_sekunden": (
            int((ende - timezone.now()).total_seconds()) if hat_reservierung else 0
        ),
        "max_erneuerungen": max_erneuerungen(),
        "zeilen": ergebnis,
    }


def gebe_frei(membre, variante_ids=None) -> int:
    """Gibt die Reservierung des Mitglieds frei (ganz oder nur für `variante_ids`)."""
    qs = PanierReservierung.objects.filter(membre=membre)
    if variante_ids is not None:
        qs = qs.filter(variante_id__in=list(variante_ids))
    geloescht, _ = qs.delete()
    return geloescht


def bereinige_abgelaufene() -> int:
    """Löscht abgelaufene Reservierungen (Aufräumen — die Verfügbarkeit hängt nicht davon ab)."""
    geloescht, _ = PanierReservierung.objects.filter(expire_le__lte=timezone.now()).delete()
    return geloescht
