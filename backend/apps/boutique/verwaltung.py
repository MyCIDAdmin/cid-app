"""Shop-Verwaltung — Überblick (Release „Shop-Verwaltung einfacher", 2026-11-02).

Rein lesend, ohne Migration: Kacheln, Aufgaben, Bestell-Stapel und Artikel-Hinweise werden bei
jedem Aufruf aus den vorhandenen Daten berechnet (Bestellungen, Reservierungen, Artikel). Die
Kennzahlen zählen die GESAMTE Datenbasis — die früheren Kopf-Kacheln zählten nur die erste
Ergebnisseite der Listen-Endpunkte.

Aufgaben sind keine gespeicherten Datensätze: sie verschwinden von selbst, sobald die Bedingung
nicht mehr zutrifft. Wer eine Aufgabe erledigen DARF, bleibt unverändert (Zahlung bestätigen und
Versand eintragen = Directeur Financier+, alles andere = Seite `page_boutique` mit Schreibrecht);
der Endpunkt meldet das pro Aufgabe (`darf`), damit die Oberfläche fremde Aufgaben ausblenden
kann, ändert aber nichts an den Prüfungen der eigentlichen Aktionen.
"""

from django.db.models import Count, Exists, OuterRef, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ROLE_LEVELS
from apps.rbac.models import NiveauAcces
from apps.rbac.permissions import page_admin_permission
from apps.rbac.services import has_admin_page_access

from .models import (
    Commande,
    LigneCommande,
    ModePaiementCommande,
    Produit,
    ProduitImage,
    Reservierung,
    ReservierungsModus,
    StatutCommande,
    StatutProduit,
    StatutReservierung,
    TypeProduit,
)
from .permissions import PAIEMENT_EXPEDITION_MIN_LEVEL

# Schwellen (Konzept 02.11.2026, Entscheidung 3): ab so vielen Tagen gilt etwas als „wartet
# schon länger" (rote Kachel/Aufgabe).
SCHWELLE_ZAHLUNG_TAGE = 7
SCHWELLE_VERSAND_TAGE = 5
SCHWELLE_UNTERWEGS_TAGE = 5
NAME_ZU_LANG = 60  # Zeichen

# Stapel der Bestellliste (technischer Status -> fünf verständliche Stapel).
STAPEL = {
    "zahlung_offen": [StatutCommande.EN_ATTENTE],
    "zu_versenden": [StatutCommande.CONFIRMEE, StatutCommande.EN_PREPARATION],
    "unterwegs": [StatutCommande.EXPEDIEE],
    "erledigt": [StatutCommande.LIVREE],
    "abgebrochen": [StatutCommande.ANNULEE, StatutCommande.REMBOURSEE],
}

ROT = "rot"
ORANGE = "orange"
INFO = "info"
_REIHENFOLGE = {ROT: 0, ORANGE: 1, INFO: 2}


def _tage_seit(zeitpunkt, jetzt) -> int:
    return max(0, (jetzt - zeitpunkt).days)


def _ton(anzahl: int, tage: int | None, schwelle: int | None) -> str:
    if anzahl == 0:
        return "gruen"
    if schwelle is not None and tage is not None and tage >= schwelle:
        return ROT
    return ORANGE


def _manuelle_zahlungen():
    """Offene Bestellungen, die jemand von Hand bestätigen muss. Online-Zahlungen (Karte/PayPal)
    bestätigt der Zahlungsdienst selbst per Webhook und sind deshalb keine Aufgabe."""
    return Commande.objects.filter(statut=StatutCommande.EN_ATTENTE).exclude(
        mode_paiement=ModePaiementCommande.EN_LIGNE
    )


def _zu_versenden():
    """Bezahlte Bestellungen mit mindestens einem physischen Artikel (ein reiner Gutschein-
    Kauf wird nicht versendet)."""
    physisch = LigneCommande.objects.filter(
        commande=OuterRef("pk"), variante__produit__type_produit=TypeProduit.PHYSIQUE
    )
    return Commande.objects.filter(
        statut__in=STAPEL["zu_versenden"],
    ).filter(Exists(physisch))


def stapel_zaehlen() -> dict[str, int]:
    gruppen = {
        s["statut"]: s["n"] for s in Commande.objects.values("statut").annotate(n=Count("id"))
    }
    return {name: sum(gruppen.get(st, 0) for st in stati) for name, stati in STAPEL.items()}


def _bestell_aufgaben(jetzt):
    zahlung = list(_manuelle_zahlungen().values_list("created_at", flat=True))
    versand = list(_zu_versenden().values_list("date_paiement_confirme", "created_at"))
    unterwegs = list(
        Commande.objects.filter(statut=StatutCommande.EXPEDIEE).values_list(
            "date_expedition", "created_at"
        )
    )
    z_tage = [_tage_seit(z, jetzt) for z in zahlung]
    v_tage = [_tage_seit(b or c, jetzt) for b, c in versand]
    u_tage = [_tage_seit(d or c, jetzt) for d, c in unterwegs]
    return z_tage, v_tage, u_tage


def _label(variante) -> str:
    return " ".join(x for x in (variante.taille, variante.couleur) if x)


def artikel_hinweise(jetzt=None) -> dict[str, list[dict]]:
    """Hinweise pro Artikel (nur Entwurf und veröffentlicht). Jeder Hinweis: `code`, `schwere`
    (rot/orange/info) und `detail` (Zahlen/Namen für den Text der Oberfläche)."""
    jetzt = jetzt or timezone.now()
    ergebnis: dict[str, list[dict]] = {}
    produkte = (
        Produit.objects.exclude(statut=StatutProduit.ARCHIVE)
        .annotate(
            _hat_galerie=Exists(ProduitImage.objects.filter(produit=OuterRef("pk"))),
        )
        .prefetch_related("variantes")
    )
    for p in produkte:
        hinweise: list[dict] = []
        veroeffentlicht = p.statut == StatutProduit.PUBLIE
        mit_frist = p.reservierung_modus != ReservierungsModus.AUS
        if veroeffentlicht and mit_frist and p.reservierung_frist and p.reservierung_frist < jetzt:
            hinweise.append({"code": "frist_vorbei", "schwere": ROT, "detail": {}})
        if veroeffentlicht and p.type_produit == TypeProduit.PHYSIQUE:
            if p.en_rupture:
                hinweise.append({"code": "ausverkauft", "schwere": ORANGE, "detail": {}})
            else:
                knapp = [
                    {"variante": _label(v), "stock": v.stock}
                    for v in p.variantes.all()
                    if 0 < v.stock < p.seuil_alerte_stock
                ]
                if knapp:
                    hinweise.append(
                        {
                            "code": "bestand_knapp",
                            "schwere": ORANGE,
                            "detail": {"varianten": knapp},
                        }
                    )
        if (
            veroeffentlicht
            and p.type_produit == TypeProduit.PHYSIQUE
            and p.prix_final == 0
            and p.reservierung_modus != ReservierungsModus.NUR_RESERVIEREN
        ):
            hinweise.append({"code": "preis_null", "schwere": ORANGE, "detail": {}})
        if len(p.nom) > NAME_ZU_LANG:
            hinweise.append(
                {
                    "code": "name_lang",
                    "schwere": ORANGE,
                    "detail": {"laenge": len(p.nom)},
                }
            )
        if not p.image and not p._hat_galerie and p.type_produit == TypeProduit.PHYSIQUE:
            hinweise.append(
                {
                    "code": "bild_fehlt",
                    "schwere": ORANGE if veroeffentlicht else INFO,
                    "detail": {},
                }
            )
        if hinweise:
            ergebnis[str(p.id)] = hinweise
    return ergebnis


def _reservierungen_nach_frist(jetzt):
    """Aktive Reservierungen (Modus „nur reservieren") von Artikeln, deren Frist vorbei ist."""
    zeilen = (
        Reservierung.objects.filter(
            statut=StatutReservierung.AKTIV,
            produit__reservierung_modus=ReservierungsModus.NUR_RESERVIEREN,
            produit__reservierung_frist__lt=jetzt,
        )
        .values("produit_id", "produit__nom", "produit__reservierung_frist")
        .annotate(stueck=Sum("quantite"))
        .order_by("produit__reservierung_frist")
    )
    return list(zeilen)


def berechne_ueberblick(user, jetzt=None) -> dict:
    jetzt = jetzt or timezone.now()
    darf_finanz = ROLE_LEVELS.get(user.role, 0) >= PAIEMENT_EXPEDITION_MIN_LEVEL
    darf_buero = has_admin_page_access(user, "page_boutique", required=NiveauAcces.LECTURE_ECRITURE)

    z_tage, v_tage, u_tage = _bestell_aufgaben(jetzt)
    res_offen = _reservierungen_nach_frist(jetzt)
    hinweise = artikel_hinweise(jetzt)
    artikel_namen = dict(Produit.objects.filter(id__in=hinweise.keys()).values_list("id", "nom"))

    z_alt = max(z_tage, default=None)
    v_alt = max(v_tage, default=None)
    res_stueck = sum(r["stueck"] for r in res_offen)

    kacheln = {
        "zahlung_offen": {
            "anzahl": len(z_tage),
            "aeltest_tage": z_alt,
            "ton": _ton(len(z_tage), z_alt, SCHWELLE_ZAHLUNG_TAGE),
        },
        "zu_versenden": {
            "anzahl": len(v_tage),
            "aeltest_tage": v_alt,
            "ton": _ton(len(v_tage), v_alt, SCHWELLE_VERSAND_TAGE),
        },
        "reservierungen_offen": {
            "anzahl": res_stueck,
            "aeltest_tage": None,
            "ton": ROT if res_stueck else "gruen",
        },
        "katalog_hinweise": {
            "anzahl": len(hinweise),
            "aeltest_tage": None,
            "ton": ORANGE if hinweise else "gruen",
        },
    }

    aufgaben: list[dict] = []
    if z_tage:
        aufgaben.append(
            {
                "id": "zahlung",
                "art": "zahlung",
                "anzahl": len(z_tage),
                "tage": z_alt,
                "schwere": ROT if z_alt >= SCHWELLE_ZAHLUNG_TAGE else ORANGE,
                "rolle": "finanz",
                "darf": darf_finanz,
                "ziel": {"tab": "bestellungen", "stapel": "zahlung_offen"},
                "daten": {},
            }
        )
    if v_tage:
        aufgaben.append(
            {
                "id": "versand",
                "art": "versand",
                "anzahl": len(v_tage),
                "tage": v_alt,
                "schwere": ROT if v_alt >= SCHWELLE_VERSAND_TAGE else ORANGE,
                "rolle": "finanz",
                "darf": darf_finanz,
                "ziel": {"tab": "bestellungen", "stapel": "zu_versenden"},
                "daten": {},
            }
        )
    for r in res_offen:
        aufgaben.append(
            {
                "id": f"reservierung-{r['produit_id']}",
                "art": "reservierung",
                "anzahl": r["stueck"],
                "tage": _tage_seit(r["produit__reservierung_frist"], jetzt),
                "schwere": ROT,
                "rolle": "buero",
                "darf": darf_buero,
                "ziel": {"tab": "reservierungen", "produit": str(r["produit_id"])},
                "daten": {"produkt": r["produit__nom"]},
            }
        )
    if hinweise:
        namen = [artikel_namen.get(pid_, "") for pid_ in list(hinweise)[:3]]
        aufgaben.append(
            {
                "id": "katalog",
                "art": "katalog",
                "anzahl": len(hinweise),
                "tage": None,
                "schwere": (
                    ROT
                    if any(h["schwere"] == ROT for hs in hinweise.values() for h in hs)
                    else ORANGE
                ),
                "rolle": "buero",
                "darf": darf_buero,
                "ziel": {"tab": "katalog", "filter": "hinweise"},
                "daten": {"namen": [n for n in namen if n]},
            }
        )
    lange = [t for t in u_tage if t >= SCHWELLE_UNTERWEGS_TAGE]
    if lange:
        aufgaben.append(
            {
                "id": "unterwegs",
                "art": "unterwegs",
                "anzahl": len(lange),
                "tage": max(lange),
                "schwere": INFO,
                "rolle": "buero",
                "darf": darf_buero,
                "ziel": {"tab": "bestellungen", "stapel": "unterwegs"},
                "daten": {},
            }
        )
    aufgaben.sort(key=lambda a: (_REIHENFOLGE[a["schwere"]], -(a["tage"] or 0)))

    return {
        "stand": jetzt.isoformat(),
        "kann_finanz": darf_finanz,
        "kann_buero": darf_buero,
        "schwellen": {
            "zahlung_tage": SCHWELLE_ZAHLUNG_TAGE,
            "versand_tage": SCHWELLE_VERSAND_TAGE,
            "unterwegs_tage": SCHWELLE_UNTERWEGS_TAGE,
        },
        "kacheln": kacheln,
        "aufgaben": aufgaben,
        "stapel": stapel_zaehlen(),
        "hinweise": hinweise,
    }


class VerwaltungUeberblickView(APIView):
    """GET /boutique/verwaltung/ueberblick/ — nur lesend, Seite `page_boutique` (Lesen)."""

    permission_classes = [IsAuthenticated, page_admin_permission("page_boutique")]

    def get(self, request):
        return Response(berechne_ueberblick(request.user))
