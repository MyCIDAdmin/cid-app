"""Nutzungsstatistik (Release 23) : welche Module werden wie oft und von wie vielen genutzt?

Datenschutz : gezählt werden nur „Nutzungsfenster“ — pro Person, Tag und Modul höchstens eines je
5 Minuten, in denen mindestens eine Anfrage an das Modul ging. Keine Seitenaufrufe, Pfade oder
Inhalte ; die Auswertung zeigt nur Summen (Anzahl Personen), nie einzelne Personen.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.db.models import Count, F, Sum
from django.utils import timezone

from apps.accounts.models import User

from .models import Nutzung

BERLIN = ZoneInfo("Europe/Berlin")
FENSTER_SEKUNDEN = 300
ERLAUBTE_TAGE = (7, 30, 90)

# URL-Präfix unter /api/v1/ → (Bezeichnung DE, FR). Verwaltungs- und Technikmodule (auth,
# notifications, rbac, aktivitaet) zählen nicht : sie wären Hintergrundrauschen.
NUTZUNG_MODULE = {
    "membres": ("Mitglieder", "Membres"),
    "adhesions": ("Beitritt & Angebote", "Adhésions et offres"),
    "cotisations": ("Beiträge & Zahlungen", "Cotisations et paiements"),
    "evenements": ("Veranstaltungen", "Événements"),
    "boutique": ("Shop", "Boutique"),
    "communaute": ("Community", "Communauté"),
    "kalender": ("Kalender", "Calendrier"),
    "projets": ("Projekte", "Projets"),
    "umfragen": ("Umfragen", "Sondages"),
    "votes": ("Abstimmungen", "Votes"),
    "partenaires": ("Partner", "Partenaires"),
    "regionen": ("Sektoren", "Secteurs"),
    "support": ("Support", "Support"),
    "finances": ("Finanzen", "Finances"),
    "stats": ("Statistiken", "Statistiques"),
}


def modul_von(pfad: str) -> str | None:
    teile = [t for t in pfad.split("/") if t]
    if len(teile) >= 3 and teile[0] == "api" and teile[1] == "v1" and teile[2] in NUTZUNG_MODULE:
        return teile[2]
    return None


def heute():
    return timezone.localdate(timezone.now(), BERLIN)


def zaehlen(user, modul: str) -> bool:
    """Ein Nutzungsfenster zählen (höchstens eines je Person, Modul und 5 Minuten)."""
    if not cache.add(f"nutzung:{user.pk}:{modul}", 1, FENSTER_SEKUNDEN):
        return False
    eintrag, neu = Nutzung.objects.get_or_create(
        user=user, tag=heute(), modul=modul, defaults={"anzahl": 1}
    )
    if not neu:
        Nutzung.objects.filter(pk=eintrag.pk).update(anzahl=F("anzahl") + 1)
    return True


def _aktive(tage: int) -> int:
    seit = heute() - timedelta(days=tage - 1)
    return Nutzung.objects.filter(tag__gte=seit).values("user").distinct().count()


def statistik(tage: int) -> dict:
    tag_heute = heute()
    seit = tag_heute - timedelta(days=tage - 1)
    im_zeitraum = Nutzung.objects.filter(tag__gte=seit)

    tage_liste = [seit + timedelta(days=i) for i in range(tage)]
    reihen = {t: {"nutzer": 0, "fenster": 0} for t in tage_liste}
    for z in im_zeitraum.values("tag").annotate(
        nutzer=Count("user", distinct=True), fenster=Sum("anzahl")
    ):
        if z["tag"] in reihen:
            reihen[z["tag"]] = {"nutzer": z["nutzer"], "fenster": z["fenster"]}

    pro_modul = {
        z["modul"]: z
        for z in im_zeitraum.values("modul").annotate(
            nutzer=Count("user", distinct=True), fenster=Sum("anzahl")
        )
    }
    konten = User.objects.filter(is_active=True).count()
    module = []
    for schluessel, (de, fr) in NUTZUNG_MODULE.items():
        z = pro_modul.get(schluessel)
        module.append(
            {
                "modul": schluessel,
                "label": {"de": de, "fr": fr},
                "nutzer": z["nutzer"] if z else 0,
                "fenster": z["fenster"] if z else 0,
            }
        )
    module.sort(key=lambda m: (-m["nutzer"], -m["fenster"], m["modul"]))
    return {
        "tage": tage,
        "aktiv": {"d1": _aktive(1), "d7": _aktive(7), "d30": _aktive(30), "konten": konten},
        "verlauf": [{"tag": t.isoformat(), **w} for t, w in reihen.items()],
        "module": module,
        "ungenutzt": [m["modul"] for m in module if m["nutzer"] == 0],
    }
