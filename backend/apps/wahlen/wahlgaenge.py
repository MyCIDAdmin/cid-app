"""Weitere Wahlgänge und Probewahl (Welle 2d).

Folgewahl: Endet ein Wahlgang mit Stichwahl oder Gleichstand, legt das System beim Veröffentlichen
des Ergebnisses den nächsten Wahlgang als Entwurf an. Er enthält nur die betroffenen Kandidaturen
(als zugelassen übernommen), denselben Ausschuss und eine knappe Terminreihe. Der Ausschuss prüft
die Termine, das Büro veröffentlicht, Öffnen und Schließen laufen wie immer mit zwei Freigaben.

Probewahl: Ein Trockenlauf mit erfundenen Stimmen. Er legt alles in einer Transaktion an, wertet mit
derselben Logik aus wie die echte Wahl und macht danach alles rückgängig: nichts wird gespeichert,
niemand benachrichtigt, nichts zählt.
"""

from __future__ import annotations

import logging
import random
import re
from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import services
from .models import (
    AusschussMitglied,
    BekanntmachungStatus,
    KandidatPerson,
    Kandidatur,
    KandidaturStatus,
    Reglement,
    Wahl,
    Wahlform,
    WahlStatus,
)

logger = logging.getLogger(__name__)

FOLGE_AUSGAENGE = ("stichwahl", "gleichstand")
SZENARIEN = ("zufall", "gleichstand")
_SUFFIX = re.compile(r"\s+[–-]\s+\d+\.\s+Wahlgang$")

# ------------------------------------------------------------------------------ Folgewahl


def folgewahl_titel(wahl: Wahl, runde: int) -> str:
    basis = _SUFFIX.sub("", wahl.titel)
    zusatz = f" – {runde}. Wahlgang"
    return basis[: 200 - len(zusatz)] + zusatz


def folgewahl_moeglich(wahl: Wahl, ergebnis: dict | None = None) -> bool:
    """Nur für Listen, Einzelpersonen und Mehrfachwahl; nur nach veröffentlichtem Ergebnis."""
    if not wahl.ergebnis_freigegeben_am or not wahl.vote_session_id:
        return False
    if wahl.form not in (Wahlform.LISTE, Wahlform.PERSON, Wahlform.MEHRFACH):
        return False
    ergebnis = ergebnis or services.ergebnis_auswerten(wahl)
    return ergebnis["ausgang"] in FOLGE_AUSGAENGE and bool(ergebnis["stichwahl_zwischen"])


def _kandidaturen_der_runde(wahl: Wahl, ergebnis: dict) -> list[Kandidatur]:
    namen = set(ergebnis["stichwahl_zwischen"])
    zugelassen = wahl.kandidaturen.filter(status=KandidaturStatus.ZUGELASSEN).prefetch_related(
        "personen__membre"
    )
    return [k for k in zugelassen if services.option_label(wahl, k) in namen]


def _kopiere_kandidatur(k: Kandidatur, neu: Wahl) -> Kandidatur:
    jetzt = timezone.now()
    kopie = Kandidatur.objects.create(
        wahl=neu,
        einreicher=k.einreicher,
        name=k.name,
        leitsatz=k.leitsatz,
        vorstellung=k.vorstellung,
        programm=k.programm,
        sprache=k.sprache,
        rechte_foto=k.rechte_foto,
        bestaetigt_wahlordnung=k.bestaetigt_wahlordnung,
        bestaetigt_fairness=k.bestaetigt_fairness,
        bestaetigt_datenschutz=k.bestaetigt_datenschutz,
        status=KandidaturStatus.ZUGELASSEN,
        eingereicht_am=k.eingereicht_am,
        entschieden_am=jetzt,
    )
    for p in k.personen.all():
        KandidatPerson.objects.create(
            kandidatur=kopie,
            membre=p.membre,
            amt=p.amt,
            reihenfolge=p.reihenfolge,
            foto=p.foto.name if p.foto else "",
        )
    return kopie


def _termine(wahl: Wahl) -> dict:
    """Knappe Reihe: Kampagne bis morgen, Wahl übermorgen 9 Uhr, gleiche Dauer wie zuvor."""
    heute = timezone.localdate()
    dauer = min(max(wahl.wahl_bis - wahl.wahl_von, timedelta(days=1)), timedelta(days=14))
    von = timezone.make_aware(datetime.combine(heute + timedelta(days=2), time(9, 0)))
    bis = von + dauer
    einspruch = bis.date() + timedelta(days=services.EINSPRUCH_TAGE)
    return {
        "ankuendigung_am": heute - timedelta(days=2),
        "kandidatur_von": heute - timedelta(days=2),
        "kandidatur_bis": heute - timedelta(days=1),
        "pruefung_bis": heute,
        "kampagne_bis": heute + timedelta(days=1),
        "wahl_von": von,
        "wahl_bis": bis,
        "einspruch_bis": einspruch,
        "uebergabe_bis": einspruch + timedelta(days=14),
    }


@transaction.atomic
def folgewahl_anlegen(wahl: Wahl, user) -> tuple[Wahl, bool]:
    """Legt den nächsten Wahlgang als Entwurf an. Gibt (Wahl, neu_angelegt) zurück; gibt es schon
    eine Folgewahl, kommt sie unverändert zurück."""
    vorhanden = wahl.folgewahlen.order_by("created_at").first()
    if vorhanden:
        return vorhanden, False
    if not wahl.ergebnis_freigegeben_am:
        raise ValidationError({"wahl": "Das Ergebnis ist noch nicht veröffentlicht."})
    ergebnis = services.ergebnis_auswerten(wahl)
    if not folgewahl_moeglich(wahl, ergebnis):
        raise ValidationError({"wahl": "Dieses Ergebnis braucht keinen weiteren Wahlgang."})
    kandidaturen = _kandidaturen_der_runde(wahl, ergebnis)
    if len(kandidaturen) < 2 and wahl.form != Wahlform.MEHRFACH:
        raise ValidationError({"wahl": "Es gibt keine zwei Kandidaturen für einen weiteren Gang."})

    posten = wahl.posten
    if wahl.form == Wahlform.MEHRFACH:
        posten = max(1, wahl.posten - len(ergebnis["gewaehlt"]))
    runde = wahl.runde + 1
    neu = Wahl.objects.create(
        titel=folgewahl_titel(wahl, runde),
        beschreibung=wahl.beschreibung,
        form=wahl.form,
        # Im weiteren Wahlgang genügt die relative Mehrheit; der Ausschuss kann das ändern.
        mehrheit="relativ",
        listen_groesse=wahl.listen_groesse,
        posten=posten,
        unterstuetzungen_noetig=wahl.unterstuetzungen_noetig,
        zustimmungen_noetig=wahl.zustimmungen_noetig,
        aufbewahrung=wahl.aufbewahrung,
        status=WahlStatus.ENTWURF,
        vorgaenger=wahl,
        runde=runde,
        created_by=user or wahl.created_by,
        **_termine(wahl),
    )
    for a in wahl.ausschuss.all():
        AusschussMitglied.objects.create(wahl=neu, membre=a.membre)
    for k in kandidaturen:
        _kopiere_kandidatur(k, neu)
    for r in wahl.reglemente.all():
        Reglement.objects.create(
            wahl=neu,
            schluessel=r.schluessel,
            version=r.version,
            gueltig_ab=r.gueltig_ab,
            texte=r.texte,
            geprueft=r.geprueft,
        )
    # Kein Aufruf zur Kandidatur: die Kandidaturen stehen schon fest.
    services.bekanntmachungen_anlegen(neu, ["ankuendigung", "zugelassen", "wahlbeginn", "ergebnis"])
    from . import mitteilungen

    mitteilungen.planen(neu)
    return neu, True


def folgewahl_automatisch(wahl: Wahl) -> Wahl | None:
    """Beim Veröffentlichen des Ergebnisses: Folgewahl als Entwurf anlegen und Ausschuss und Büro
    darüber informieren. Fehler hier dürfen die Veröffentlichung nie verhindern."""
    try:
        if not folgewahl_moeglich(wahl):
            return None
        with transaction.atomic():
            neu, angelegt = folgewahl_anlegen(wahl, None)
    except Exception:  # noqa: BLE001 — die Veröffentlichung des Ergebnisses geht vor
        logger.exception("Folgewahl zu %s konnte nicht angelegt werden", wahl.pk)
        return None
    if angelegt:
        from apps.accounts.models import User

        buero = User.objects.filter(role__in=services.ROLLEN_VERWALTUNG, is_active=True)
        empfaenger = {u.pk: u for u in [*services._ausschuss_user(wahl), *buero]}
        services._mitteilen(
            empfaenger.values(),
            "Zweiter Wahlgang vorbereitet",
            f"{neu.titel}: Der Entwurf ist angelegt. Bitte Termine prüfen und veröffentlichen.",
            neu,
        )
    return neu


# ------------------------------------------------------------------------------ Probewahl


class _Trockenlauf(Exception):
    """Beendet die Transaktion des Trockenlaufs, damit alles zurückgerollt wird."""


def bereitschaft(wahl: Wahl) -> list[dict]:
    """Startklar? Dieselben Voraussetzungen wie beim Öffnen, dazu Bekanntmachungen und Reglement."""
    from apps.vote.models import VoteSession
    from apps.vote.services import membres_eligibles_qs

    zugelassen = wahl.kandidaturen.filter(status=KandidaturStatus.ZUGELASSEN).count()
    minimum = wahl.posten if wahl.form == Wahlform.MEHRFACH else 1
    offen = wahl.bekanntmachungen.exclude(
        status__in=[BekanntmachungStatus.FREIGEGEBEN, BekanntmachungStatus.GESENDET]
    ).count()
    berechtigt = membres_eligibles_qs(VoteSession(eligibilite="cotisants")).count()
    jetzt = timezone.now()
    return [
        {
            "schluessel": "ausschuss",
            "ok": wahl.ausschuss.count() >= 3,
            "anzahl": wahl.ausschuss.count(),
        },
        {"schluessel": "kandidaturen", "ok": zugelassen >= minimum, "anzahl": zugelassen},
        {"schluessel": "termine", "ok": wahl.wahl_von < wahl.wahl_bis and wahl.wahl_bis > jetzt},
        {"schluessel": "bekanntmachungen", "ok": offen == 0, "anzahl": offen},
        {
            "schluessel": "reglement",
            "ok": wahl.reglemente.filter(schluessel="wahlordnung").exists(),
        },
        {"schluessel": "stimmberechtigte", "ok": berechtigt > 0, "anzahl": berechtigt},
    ]


def _beispiele(typ: str, nb_max: int) -> list[dict]:
    anzahl = max(3, nb_max + 2) if typ == "multiple" else 3
    return [{"label": f"Beispiel {chr(65 + i)}"} for i in range(anzahl)]


def _runden(gewichte: list[float], summe: int) -> list[int]:
    """Verteilt `summe` Stimmen nach Gewichten; die Summe stimmt genau (größter Rest)."""
    gesamt = sum(gewichte)
    exakt = [g / gesamt * summe for g in gewichte]
    zahlen = [int(x) for x in exakt]
    reste = sorted(range(len(exakt)), key=lambda i: exakt[i] - zahlen[i], reverse=True)
    for i in reste[: summe - sum(zahlen)]:
        zahlen[i] += 1
    return zahlen


def _zaehlungen(typ: str, anzahl: int, nb_max: int, n: int, szenario: str, rng) -> list[int]:
    """Stimmen je Option. Bei Gleichstand: oben bzw. an der Grenze genau gleich viele."""
    gleich = szenario == "gleichstand"
    if typ == "oui_non":
        if gleich:
            ja = (n - n // 10) // 2
            return [ja, ja, n - 2 * ja]
        ja = round(n * rng.uniform(0.35, 0.65))
        nein = min(n - ja, round(n * rng.uniform(0.2, 0.45)))
        return [ja, nein, n - ja - nein]
    if typ == "multiple":
        if gleich and anzahl > nb_max:
            c = [0.2] * anzahl
            for i in range(nb_max - 1):
                c[i] = 0.8
            c[nb_max - 1] = c[nb_max] = 0.5
        else:
            c = [rng.uniform(0.1, 0.9) for _ in range(anzahl)]
        zahlen = [round(n * x) for x in c]
        zu_viel = sum(zahlen) - n * nb_max
        if zu_viel > 0:
            faktor = (n * nb_max) / sum(zahlen)
            zahlen = [int(z * faktor) for z in zahlen]
            if gleich and anzahl > nb_max:
                zahlen[nb_max] = zahlen[nb_max - 1]
        return zahlen
    # unique: eine Stimme je Zettel
    if gleich and anzahl >= 2:
        spitze = round(0.4 * n)
        rest = _runden([1.0] * (anzahl - 2), n - 2 * spitze) if anzahl > 2 else []
        return [spitze, spitze, *rest]
    return _runden([rng.random() + 0.2 for _ in range(anzahl)], n)


def _zettel(zahlen: list[int], n: int) -> list[list[int]]:
    """Verteilt die Zählungen reihum auf n Zettel; keine Option steht doppelt auf einem Zettel."""
    zettel: list[list[int]] = [[] for _ in range(n)]
    start = 0
    for index, anzahl in enumerate(zahlen):
        anzahl = min(anzahl, n)
        for j in range(anzahl):
            zettel[(start + j) % n].append(index)
        start = (start + anzahl) % n
    return zettel


def probewahl(wahl: Wahl, user, stimmen: int = 40, szenario: str = "zufall", seed=None) -> dict:
    """Trockenlauf: erfundene Stimmen, echte Auswertung, nichts bleibt zurück."""
    from apps.vote.models import (
        ChoixExprime,
        VoteExprime,
        VoteOption,
        VoteOptionCandidat,
        VoteSession,
    )
    from apps.vote.security import generer_anonymat_sel
    from apps.vote.services import membres_eligibles_qs

    if wahl.vote_session_id:
        raise ValidationError(
            {"wahl": "Die Wahl ist schon geöffnet; eine Probe ist nicht mehr nötig."}
        )
    if szenario not in SZENARIEN:
        raise ValidationError({"szenario": "Unbekanntes Szenario."})
    n = max(4, min(int(stimmen), 500))
    if szenario == "gleichstand" and n % 2:
        n -= 1
    rng = random.Random(seed)
    antwort: dict = {}
    try:
        with transaction.atomic():
            typ, nb_max, optionen, schwelle = services.optionen_fuer(wahl)
            beispiel = not optionen
            if beispiel:
                optionen = _beispiele(typ, nb_max)
            jetzt = timezone.now()
            session = VoteSession.objects.create(
                titre="Probewahl",
                description="Probewahl",
                type_vote=typ,
                mode_anonymat="nominatif",
                nb_choix_max=nb_max,
                eligibilite="cotisants",
                duree_minutes=10,
                seuil_victoire_pct=schwelle,
                anonymat_sel=generer_anonymat_sel(),
                statut="cloturee",
                date_fin=jetzt,
                date_cloture=jetzt,
                created_by=user,
            )
            objekte = []
            for i, opt in enumerate(optionen):
                opt = dict(opt)
                kandidaten = opt.pop("candidats", [])
                option = VoteOption.objects.create(session=session, ordre=i, **opt)
                VoteOptionCandidat.objects.bulk_create(
                    VoteOptionCandidat(option=option, ordre=j, **c)
                    for j, c in enumerate(kandidaten)
                )
                objekte.append(option)
            if typ == "preferentiel":
                zettel = []
                for _ in range(n):
                    reihe = list(range(len(objekte)))
                    rng.shuffle(reihe)
                    zettel.append(reihe)
            else:
                zahlen = _zaehlungen(typ, len(objekte), nb_max, n, szenario, rng)
                zettel = _zettel(zahlen, n)
            for i, auswahl in enumerate(zettel):
                bulletin = VoteExprime.objects.create(
                    session=session, voter_token_hash=f"probe-{i}"
                )
                ChoixExprime.objects.bulk_create(
                    ChoixExprime(
                        bulletin=bulletin,
                        option=objekte[o],
                        rang=rang + 1 if typ == "preferentiel" else 0,
                    )
                    for rang, o in enumerate(auswahl)
                )
            ergebnis = services.ergebnis_auswerten(wahl, session)
            berechtigt = max(membres_eligibles_qs(session).count(), n)
            ergebnis["beteiligung"] = {
                "abgegeben": n,
                "berechtigt": berechtigt,
                "prozent": round(100 * n / berechtigt, 1),
            }
            antwort = {
                "stimmen": n,
                "szenario": szenario,
                "typ": typ,
                "beispiel": beispiel,
                "ergebnis": ergebnis,
                "weiterer_wahlgang": ergebnis["ausgang"] in FOLGE_AUSGAENGE
                and wahl.form in (Wahlform.LISTE, Wahlform.PERSON, Wahlform.MEHRFACH),
            }
            raise _Trockenlauf
    except _Trockenlauf:
        pass
    antwort["bereitschaft"] = bereitschaft(wahl)
    return antwort
