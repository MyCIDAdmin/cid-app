"""Reservierungen im Shop (Release 4, 2026-10-12).

Pro Produkt (`Produit.reservierung_modus`):
  - AUS: normaler Verkauf, keine Limits.
  - NUR_RESERVIEREN: das Mitglied legt eine `Reservierung` an (keine Bestellung, keine Zahlung);
    sie zählt gegen die Limits, bis sie storniert wird.
  - RESERVIEREN_UND_BEZAHLEN: normale Bestellung (`CommandeViewSet.passer`); die Frist und die
    Mengenlimits werden dort über `pruefe_bestellung` geprüft. Bestellungen zählen mit, solange
    sie nicht storniert/erstattet sind.

Alle Prüfungen laufen serverseitig unter Zeilensperre des Produkts (CLAUDE.md §8): zwei
gleichzeitige Anfragen können das Gesamtlimit nicht überschreiten.
"""

from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    LigneCommande,
    Produit,
    Reservierung,
    ReservierungsModus,
    StatutCommande,
    StatutReservierung,
)

_ZAEHLENDE_RESERVIERUNGEN = (StatutReservierung.AKTIV, StatutReservierung.ABGEHOLT)
_NICHT_ZAEHLENDE_BESTELLUNGEN = (StatutCommande.ANNULEE, StatutCommande.REMBOURSEE)


def reservierte_menge(produit: Produit, membre=None) -> int:
    """Menge, die bereits gegen die Limits zählt (optional nur für ein Mitglied)."""
    if produit.reservierung_modus == ReservierungsModus.NUR_RESERVIEREN:
        qs = Reservierung.objects.filter(produit=produit, statut__in=_ZAEHLENDE_RESERVIERUNGEN)
        if membre is not None:
            qs = qs.filter(membre=membre)
        return qs.aggregate(t=Sum("quantite"))["t"] or 0
    if produit.reservierung_modus == ReservierungsModus.RESERVIEREN_UND_BEZAHLEN:
        qs = LigneCommande.objects.filter(variante__produit=produit).exclude(
            commande__statut__in=_NICHT_ZAEHLENDE_BESTELLUNGEN
        )
        if membre is not None:
            qs = qs.filter(commande__membre=membre)
        return qs.aggregate(t=Sum("quantite"))["t"] or 0
    return 0


def frist_abgelaufen(produit: Produit, jetzt=None) -> bool:
    frist = produit.reservierung_frist
    return frist is not None and (jetzt or timezone.now()) > frist


def verfuegbare_menge(produit: Produit):
    """Restmenge laut Gesamtlimit, None = unbegrenzt/keine Reservierung."""
    if (
        produit.reservierung_modus == ReservierungsModus.AUS
        or produit.reservierung_max_gesamt is None
    ):
        return None
    return max(0, produit.reservierung_max_gesamt - reservierte_menge(produit))


def ist_offen(produit: Produit) -> bool:
    """Kann man dieses Produkt gerade noch reservieren/bestellen (Frist + Gesamtlimit)?"""
    if produit.reservierung_modus == ReservierungsModus.AUS:
        return True
    if frist_abgelaufen(produit):
        return False
    rest = verfuegbare_menge(produit)
    return rest is None or rest > 0


def pruefe_menge(produit: Produit, membre, quantite: int) -> None:
    """Wirft ValidationError, wenn Frist oder Limits verletzt würden. MUSS unter einer
    Zeilensperre des Produkts aufgerufen werden (`Produit.objects.select_for_update()`)."""
    if produit.reservierung_modus == ReservierungsModus.AUS:
        return
    if frist_abgelaufen(produit):
        raise ValidationError(
            {"produit": f"Die Reservierungsfrist für « {produit.nom} » ist abgelaufen."}
        )
    if produit.reservierung_max_pro_mitglied is not None:
        bisher = reservierte_menge(produit, membre)
        if bisher + quantite > produit.reservierung_max_pro_mitglied:
            frei = max(0, produit.reservierung_max_pro_mitglied - bisher)
            raise ValidationError(
                {
                    "quantite": (
                        f"Pro Mitglied sind höchstens {produit.reservierung_max_pro_mitglied} "
                        f"Stück von « {produit.nom} » möglich (noch {frei} frei)."
                    )
                }
            )
    if produit.reservierung_max_gesamt is not None:
        rest = produit.reservierung_max_gesamt - reservierte_menge(produit)
        if quantite > rest:
            raise ValidationError(
                {
                    "quantite": (
                        f"Von « {produit.nom} » sind nur noch {max(0, rest)} Stück verfügbar."
                    )
                }
            )


def pruefe_bestellung(lignes, membre) -> None:
    """Prüft die Reservierungsregeln aller Warenkorbzeilen einer Bestellung (`lignes` = Liste
    von {"variante": VarianteProduit, "quantite": int}). Muss in der Transaktion von `passer`
    laufen; sperrt die betroffenen Produkte in stabiler Reihenfolge."""
    produkt_ids = sorted({str(z["variante"].produit_id) for z in lignes})
    produkte = {
        str(p.id): p for p in Produit.objects.select_for_update().filter(id__in=produkt_ids)
    }
    pro_produkt: dict[str, int] = {}
    for zeile in lignes:
        pid = str(zeile["variante"].produit_id)
        pro_produkt[pid] = pro_produkt.get(pid, 0) + zeile["quantite"]
    for pid, menge in pro_produkt.items():
        produkt = produkte[pid]
        if produkt.reservierung_modus == ReservierungsModus.NUR_RESERVIEREN:
            raise ValidationError(
                {"lignes": f"« {produkt.nom} » kann nur reserviert, nicht bestellt werden."}
            )
        pruefe_menge(produkt, membre, menge)
