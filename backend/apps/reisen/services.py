"""Fachlogik des Moduls Reisen : Sichtbarkeit, Rollen, Privatsphäre, Entscheidungen, Kosten,
Benachrichtigungen. Die Prüfungen gelten im Server (API), nicht nur in der Oberfläche."""

from collections import defaultdict
from decimal import ROUND_DOWN, Decimal
from functools import cached_property

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import ROLE_LEVELS, Role
from apps.membres.models import StatutMembre
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier
from apps.regionen import formattext

from .models import (
    EntscheidungTyp,
    EntStatus,
    Freigabe,
    Reise,
    ReiseTeilnehmer,
    Richtung,
    Rolle,
    Sichtbarkeit,
    Stimme,
    TeilgruppeMitglied,
    TStatus,
    Wert,
)

BEREINIGT = ("beschreibung", "stadion_infos", "laenderinfo", "regeln")


def name_von(user) -> str:
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}".strip() or user.email
    return user.email


def ist_aktives_mitglied(user) -> bool:
    membre = getattr(user, "membre", None)
    return membre is not None and membre.statut == StatutMembre.ACTIF


def ist_verwalter(user) -> bool:
    """App Admin und Bureau Admin dürfen alle Reisen verwalten (nicht automatisch Details sehen)."""
    return ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]


def reisen_sichtbar(user):
    q = Q(teilnehmer__user=user) | Q(sichtbarkeit=Sichtbarkeit.KONTO)
    if ist_aktives_mitglied(user):
        q |= Q(sichtbarkeit=Sichtbarkeit.MITGLIEDER)
    qs = Reise.objects.all()
    if not ist_verwalter(user):
        qs = qs.filter(q)
    return qs.distinct()


def teilnehmer_von(reise, user):
    return reise.teilnehmer.filter(user=user).first()


class Kontext:
    """Wer ist der Anfragende in dieser Reise ? Einmal berechnet, in allen Prüfungen genutzt."""

    def __init__(self, reise, user):
        self.reise = reise
        self.user = user
        self.tn = teilnehmer_von(reise, user)
        self.verwalter = ist_verwalter(user)
        self.orga = bool(self.tn and self.tn.ist_orga and self.tn.status == TStatus.DABEI)
        self.darf_verwalten = self.orga or self.verwalter
        self.voll = bool(self.tn and self.tn.status == TStatus.DABEI) or self.darf_verwalten

    @cached_property
    def gruppen_map(self) -> dict:
        """Teilnehmer-Id → Ids seiner Teilgruppen (einmal je Anfrage geladen)."""
        karte = defaultdict(set)
        for tid, gid in TeilgruppeMitglied.objects.filter(teilgruppe__reise=self.reise).values_list(
            "teilnehmer_id", "teilgruppe_id"
        ):
            karte[tid].add(gid)
        return karte

    @cached_property
    def gruppen_ids(self) -> set:
        return self.gruppen_map.get(self.tn.pk, set()) if self.tn else set()

    def im_kreis(self, teilgruppe_id) -> bool:
        """Gilt ein Inhalt für diese Person ? Ohne Teilgruppe für alle, sonst nur für Mitglieder
        der Teilgruppe sowie Organisation und Verwaltung."""
        return teilgruppe_id is None or self.darf_verwalten or teilgruppe_id in self.gruppen_ids


# --- Beitritt ---------------------------------------------------------------------------------


def anzahl_dabei(reise) -> int:
    return reise.teilnehmer.filter(status=TStatus.DABEI).count()


def ist_voll(reise) -> bool:
    return reise.max_teilnehmer is not None and anzahl_dabei(reise) >= reise.max_teilnehmer


def organisatoren(reise):
    return [
        t.user
        for t in reise.teilnehmer.filter(
            rolle__in=[Rolle.ORGANISATOR, Rolle.VERTRETER], status=TStatus.DABEI
        ).select_related("user")
    ]


def teilnehmer_voll(reise):
    return [t.user for t in reise.teilnehmer.filter(status=TStatus.DABEI).select_related("user")]


def empfaenger(reise, teilgruppe_id=None):
    """Wer eine Mitteilung bekommt : alle Mitreisenden, bei einer Teilgruppe nur deren Mitglieder
    und die Organisation."""
    if teilgruppe_id is None:
        return teilnehmer_voll(reise)
    dabei = reise.teilnehmer.filter(status=TStatus.DABEI).select_related("user")
    ids = set(
        TeilgruppeMitglied.objects.filter(teilgruppe_id=teilgruppe_id).values_list(
            "teilnehmer_id", flat=True
        )
    )
    return [t.user for t in dabei if t.pk in ids or t.ist_orga]


def benachrichtige(users, typ, titel, message, lien, ausser=None):
    gesehen = set()
    for user in users:
        if user is None or user.pk in gesehen or (ausser is not None and user.pk == ausser.pk):
            continue
        gesehen.add(user.pk)
        notifier(user, typ, titre=titel[:200], message=message[:500], lien=lien)


def lien(reise) -> str:
    return f"/reisen/{reise.id}"


def setze_status(tn: ReiseTeilnehmer, status: str, von=None):
    tn.status = status
    tn.entschieden_von = von
    tn.save(update_fields=["status", "entschieden_von"])
    chat_abgleich(tn)


def nachruecken(reise):
    """Freier Platz : erste Person der Warteliste rückt nach und wird benachrichtigt."""
    while not ist_voll(reise):
        naechster = (
            reise.teilnehmer.filter(status=TStatus.WARTELISTE)
            .order_by("created_at")
            .select_related("user")
            .first()
        )
        if naechster is None:
            return
        setze_status(naechster, TStatus.DABEI)
        benachrichtige(
            [naechster.user],
            TypeNotification.REISE_EINLADUNG,
            f"Du bist dabei: {reise.titel}",
            "Ein Platz ist frei geworden, du bist von der Warteliste nachgerückt.",
            lien(reise),
        )


# --- Chat ---------------------------------------------------------------------------------------


def chat_anlegen(reise, orga_user):
    from apps.communaute.models import GroupeChat, TypeGroupe

    membre = getattr(orga_user, "membre", None)
    if membre is None or reise.chat_gruppe_id:
        return
    reise.chat_gruppe = GroupeChat.objects.create(
        nom=f"Reise: {reise.titel}"[:200], type_groupe=TypeGroupe.PRIVE, createur=membre
    )
    reise.save(update_fields=["chat_gruppe"])


def chat_abgleich(tn: ReiseTeilnehmer):
    """Der Reisechat enthält genau die Personen mit Status „dabei“ (mit Mitgliedsprofil)."""
    from apps.communaute.models import MembreGroupe

    gruppe = tn.reise.chat_gruppe
    membre = getattr(tn.user, "membre", None)
    if gruppe is None or membre is None:
        return
    if tn.status == TStatus.DABEI:
        MembreGroupe.objects.get_or_create(groupe=gruppe, membre=membre)
    elif membre.pk != gruppe.createur_id:
        MembreGroupe.objects.filter(groupe=gruppe, membre=membre).delete()


# --- Privatsphäre ------------------------------------------------------------------------------

BLOCK_FELD = {
    Richtung.HIN: "freigabe_hin",
    Richtung.ZWISCHEN: "freigabe_hin",
    Richtung.RUECK: "freigabe_rueck",
}


def etappe_dict(e, voll: bool) -> dict:
    d = {
        "id": str(e.id),
        "richtung": e.richtung,
        "art": e.art,
        "von_ort": e.von_ort,
        "von_code": e.von_code,
        "nach_ort": e.nach_ort,
        "nach_code": e.nach_code,
        "abfahrt": e.abfahrt.isoformat() if e.abfahrt else None,
        "ankunft": e.ankunft.isoformat() if e.ankunft else None,
        "anbieter": e.anbieter,
        "status": e.status,
    }
    if voll:
        d["referenz"] = e.referenz
    return d


def etappe_grob(e) -> dict:
    """Nur Zielort, Tag und „gebucht ja/nein“ (Person verbirgt Details vor der Organisation)."""
    return {
        "id": str(e.id),
        "richtung": e.richtung,
        "nach_ort": e.nach_ort,
        "tag": (e.ankunft or e.abfahrt).date().isoformat() if (e.ankunft or e.abfahrt) else None,
        "gebucht": e.status in ("gebucht", "selbst"),
    }


def sicht_auf(ctx: Kontext, besitzer: ReiseTeilnehmer, block: str) -> str | None:
    """'voll', 'grob' oder None. block ∈ hin | rueck | unterkunft."""
    if ctx.tn is not None and ctx.tn.pk == besitzer.pk:
        return "voll"
    if ctx.tn is not None and ctx.tn.ist_orga and ctx.tn.status == TStatus.DABEI:
        return "grob" if besitzer.verbergen_vor_orga else "voll"
    freigabe = getattr(besitzer, f"freigabe_{block}")
    if ctx.voll and freigabe == Freigabe.ALLE:
        return "voll"
    if ctx.voll and freigabe == Freigabe.TEILGRUPPE:
        if ctx.gruppen_map.get(besitzer.pk, set()) & ctx.gruppen_ids:
            return "voll"
    return None


def etappen_sichtbar(ctx: Kontext, besitzer: ReiseTeilnehmer) -> list[dict]:
    ergebnis = []
    for e in besitzer.etappen.all():
        block = "rueck" if e.richtung == Richtung.RUECK else "hin"
        sicht = sicht_auf(ctx, besitzer, block)
        if sicht == "voll":
            eigen = ctx.tn is not None and ctx.tn.pk == besitzer.pk
            ergebnis.append(etappe_dict(e, voll=eigen))
        elif sicht == "grob":
            ergebnis.append(etappe_grob(e))
    return ergebnis


def unterkunft_sichtbar(ctx: Kontext, besitzer: ReiseTeilnehmer) -> dict | None:
    sicht = sicht_auf(ctx, besitzer, "unterkunft")
    if sicht is None:
        return None
    if sicht == "grob":
        return {"gebucht": besitzer.unterkunft_gebucht}
    return {
        "unterkunft": str(besitzer.unterkunft_id) if besitzer.unterkunft_id else None,
        "name": besitzer.unterkunft.name if besitzer.unterkunft_id else besitzer.unterkunft_eigen,
        "gebucht": besitzer.unterkunft_gebucht,
    }


def hat_gebucht(tn: ReiseTeilnehmer, richtung: str) -> bool:
    return any(
        e.status in ("gebucht", "selbst") for e in tn.etappen.all() if e.richtung == richtung
    )


def uebersicht(ctx: Kontext) -> dict:
    """Ankünfte, Abreisen, Belegung und Ampel. Gruppiert statt vereinheitlicht ; Zähler sind
    anonym, Namen erscheinen nur bei Freigabe (oder für Organisation, soweit nicht verborgen)."""
    reise = ctx.reise
    dabei = list(
        reise.teilnehmer.filter(status=TStatus.DABEI)
        .select_related("user", "user__membre", "unterkunft")
        .prefetch_related("etappen")
    )
    ankuenfte, abreisen = defaultdict(list), defaultdict(list)
    belegung = defaultdict(list)
    for tn in dabei:
        personen = 1 + tn.begleitpersonen
        for e in tn.etappen.all():
            if e.richtung == Richtung.RUECK:
                zeit, ort, ziel = e.abfahrt or e.ankunft, e.von_ort, abreisen
            else:
                zeit, ort, ziel = e.ankunft or e.abfahrt, e.nach_ort, ankuenfte
            if e.richtung == Richtung.ZWISCHEN:
                continue
            tag = zeit.date().isoformat() if zeit else None
            sicht = sicht_auf(ctx, tn, "rueck" if e.richtung == Richtung.RUECK else "hin")
            ziel[(ort.strip().lower(), ort.strip(), tag)].append(
                (personen, name_von(tn.user) if sicht else None)
            )
        if tn.unterkunft_id:
            schluessel = tn.unterkunft.name
        elif tn.unterkunft_eigen:
            schluessel = "Eigene Unterkunft"
        else:
            schluessel = None
        if schluessel:
            sicht = sicht_auf(ctx, tn, "unterkunft")
            belegung[schluessel].append(
                (1 + tn.begleitpersonen, name_von(tn.user) if sicht else None)
            )

    def gruppen(daten):
        zeilen = [
            {
                "ort": ort,
                "tag": tag,
                "anzahl": sum(p for p, _n in eintraege),
                "namen": sorted({n for _p, n in eintraege if n}),
            }
            for (_k, ort, tag), eintraege in daten.items()
        ]
        return sorted(zeilen, key=lambda z: (z["tag"] or "9999", z["ort"].lower()))

    return {
        "ankuenfte": gruppen(ankuenfte),
        "abreisen": gruppen(abreisen),
        "belegung": [
            {
                "unterkunft": name,
                "anzahl": sum(p for p, _n in eintraege),
                "namen": sorted({n for _p, n in eintraege if n}),
            }
            for name, eintraege in sorted(belegung.items())
        ],
        "ampel": {
            "teilnehmer": len(dabei),
            "hin_gebucht": sum(1 for t in dabei if hat_gebucht(t, Richtung.HIN)),
            "rueck_gebucht": sum(1 for t in dabei if hat_gebucht(t, Richtung.RUECK)),
            "unterkunft_gebucht": sum(1 for t in dabei if t.unterkunft_gebucht),
            "stadionkarte": sum(1 for t in dabei if t.stadionkarte),
            "regeln_bestaetigt": sum(1 for t in dabei if t.regeln_bestaetigt_am),
        },
    }


# --- Entscheidungen -----------------------------------------------------------------------------


def stimmberechtigt(ctx: Kontext) -> bool:
    return ctx.voll


def ueber_budget(reise, baustein: str, option) -> bool:
    grenze = (reise.budget_grenzen or {}).get(baustein)
    if grenze in (None, "") or option.preis is None:
        return False
    try:
        return option.preis > Decimal(str(grenze))
    except ArithmeticError:
        return False


def termin_rang(optionen):
    """Beste Zeiträume zuerst : die meisten „passt“, dann „vielleicht“, dann der früheste."""

    def schluessel(o):
        ja = sum(1 for s in o.stimmen.all() if s.wert == Wert.JA)
        viel = sum(1 for s in o.stimmen.all() if s.wert == Wert.VIELLEICHT)
        return (-ja, -viel, o.von_datum or timezone.localdate())

    return sorted(optionen, key=schluessel)


def vorschlag_option(ent):
    optionen = [o for o in ent.optionen.all() if not o.ist_selbst]
    if not optionen or ent.typ == EntscheidungTyp.STIMMUNG:
        return None
    if ent.typ == EntscheidungTyp.TERMIN:
        rang = termin_rang(optionen)
        return rang[0] if rang and rang[0].stimmen.exists() else None

    def punkte(o):
        return sum(1 for s in o.stimmen.all() if s.wert == Wert.JA)

    beste = max(optionen, key=punkte)
    return beste if punkte(beste) > 0 else None


def stimmen_setzen(ent, user, eintraege: list[dict]):
    """Ersetzt alle Stimmen der Person bei dieser Entscheidung."""
    optionen = {str(o.id): o for o in ent.optionen.all()}
    gewaehlt = []
    for eintrag in eintraege:
        option = optionen.get(str(eintrag.get("option")))
        if option is None:
            raise ValueError("Unbekannte Option.")
        wert = eintrag.get("wert") or Wert.JA
        if wert not in Wert.values:
            raise ValueError("Ungültiger Wert.")
        gewaehlt.append((option, wert))
    if len({o.id for o, _w in gewaehlt}) != len(gewaehlt):
        raise ValueError("Eine Option darf nur einmal vorkommen.")
    einfach = ent.typ in (EntscheidungTyp.AUSWAHL, EntscheidungTyp.EMPFEHLUNG) and not ent.mehrfach
    if einfach and len(gewaehlt) > 1:
        raise ValueError("Hier ist nur eine Option wählbar.")
    if ent.typ in (EntscheidungTyp.AUSWAHL, EntscheidungTyp.EMPFEHLUNG):
        gewaehlt = [(o, Wert.JA) for o, _w in gewaehlt]
    if ent.typ == EntscheidungTyp.STIMMUNG and len(gewaehlt) > 1:
        raise ValueError("Beim Stimmungsbild gibt es eine Antwort.")
    Stimme.objects.filter(entscheidung=ent, user=user).delete()
    Stimme.objects.bulk_create(
        [Stimme(entscheidung=ent, option=o, user=user, wert=w) for o, w in gewaehlt]
    )


def beschliessen(ent, user, option, begruendung: str):
    ent.status = EntStatus.BESCHLOSSEN
    ent.beschluss_option = option
    ent.begruendung = (begruendung or "")[:500]
    ent.beschlossen_am = timezone.now()
    ent.beschlossen_von = user
    ent.save()
    if ent.typ == EntscheidungTyp.TERMIN and option is not None and option.von_datum:
        ent.reise.start = option.von_datum
        ent.reise.ende = option.bis_datum or option.von_datum
        ent.reise.save(update_fields=["start", "ende"])


def folgen(ent) -> int:
    if ent.beschluss_option_id is None:
        return 0
    return (
        Stimme.objects.filter(option_id=ent.beschluss_option_id, wert=Wert.JA)
        .values("user")
        .distinct()
        .count()
    )


# --- Kosten (nur Rechnung) ---------------------------------------------------------------------


def verteile_cents(gesamt_cents: int, gewichte: dict) -> dict:
    """Verteilt `gesamt_cents` nach Gewichten ; die Summe stimmt immer auf den Cent."""
    summe = sum(gewichte.values())
    if not gewichte or summe <= 0:
        return {}
    exakt = {k: Decimal(gesamt_cents) * w / summe for k, w in gewichte.items()}
    unten = {k: int(v.to_integral_value(rounding=ROUND_DOWN)) for k, v in exakt.items()}
    rest = gesamt_cents - sum(unten.values())
    reihenfolge = sorted(exakt, key=lambda k: (-(exakt[k] - unten[k]), str(k)))
    for k in reihenfolge[:rest]:
        unten[k] += 1
    return unten


def kosten_rechnung(reise) -> dict:
    salden: dict = defaultdict(int)
    posten = list(reise.kosten.prefetch_related("anteile").select_related("bezahlt_von"))
    for p in posten:
        cents = int((p.betrag * 100).to_integral_value())
        gewichte = {a.user_id: a.gewicht for a in p.anteile.all()}
        salden[p.bezahlt_von_id] += cents
        for uid, anteil in verteile_cents(cents, gewichte).items():
            salden[uid] -= anteil
    gläubiger = sorted(((u, c) for u, c in salden.items() if c > 0), key=lambda x: -x[1])
    schuldner = sorted(((u, -c) for u, c in salden.items() if c < 0), key=lambda x: -x[1])
    ueberweisungen = []
    gl, sc = [list(x) for x in gläubiger], [list(x) for x in schuldner]
    i = j = 0
    while i < len(gl) and j < len(sc):
        betrag = min(gl[i][1], sc[j][1])
        ueberweisungen.append((sc[j][0], gl[i][0], betrag))
        gl[i][1] -= betrag
        sc[j][1] -= betrag
        if gl[i][1] == 0:
            i += 1
        if sc[j][1] == 0:
            j += 1
    return {"posten": posten, "salden": dict(salden), "ueberweisungen": ueberweisungen}


# --- Eingaben ----------------------------------------------------------------------------------


def bereinige_felder(daten: dict) -> dict:
    for feld in BEREINIGT:
        if feld in daten and isinstance(daten[feld], str):
            daten[feld] = formattext.bereinige(daten[feld])
    return daten


def vorschau_url(reise) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/reise/{reise.id}"
