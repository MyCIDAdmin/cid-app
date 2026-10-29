"""Ausgabe (JSON) je nach Rolle und Freigaben der anfragenden Person."""

from django.utils import timezone

from . import services as sv
from .models import AStatus, EntscheidungTyp, EntStatus, TStatus, Wert


def _zeit(wert):
    return wert.isoformat() if wert else None


def _gruppe(obj) -> dict:
    g = obj.teilgruppe if obj.teilgruppe_id else None
    return {"teilgruppe": str(g.id) if g else None, "teilgruppe_name": g.name if g else None}


def reise_liste(reise, user) -> dict:
    tn = sv.teilnehmer_von(reise, user)
    zaehler = {s: 0 for s in ("dabei", "interessiert", "warteliste")}
    for t in reise.teilnehmer.all():
        if t.status in zaehler:
            zaehler[t.status] += 1
    mini = reise.min_teilnehmer
    return {
        "id": str(reise.id),
        "titel": reise.titel,
        "ziel_ort": reise.ziel_ort,
        "land": reise.land,
        "start": _zeit(reise.start),
        "ende": _zeit(reise.ende),
        "phase": reise.phase,
        "abgesagt": reise.abgesagt,
        "sichtbarkeit": reise.sichtbarkeit,
        "beitritt": reise.beitritt,
        "rencontre": str(reise.rencontre_id) if reise.rencontre_id else None,
        "dabei": zaehler["dabei"],
        "interessiert": zaehler["interessiert"],
        "warteliste": zaehler["warteliste"],
        "min_teilnehmer": mini,
        "max_teilnehmer": reise.max_teilnehmer,
        "findet_statt": None if not mini else zaehler["dabei"] >= mini,
        "mein_status": tn.status if tn else None,
        "meine_rolle": tn.rolle if tn else None,
    }


def option_dict(ent, o, ctx, hat_stimmen_sicht: bool) -> dict:
    zaehler = {w: 0 for w in Wert.values}
    waehler = {w: [] for w in Wert.values}
    meine = None
    for s in o.stimmen.all():
        zaehler[s.wert] += 1
        if hat_stimmen_sicht:
            waehler[s.wert].append(sv.name_von(s.user))
        if s.user_id == ctx.user.pk:
            meine = s.wert
    return {
        "id": str(o.id),
        "titel": o.titel,
        "beschreibung": o.beschreibung,
        "link": o.link,
        "preis": f"{o.preis:.2f}" if o.preis is not None else None,
        "preis_einheit": o.preis_einheit,
        "entfernung": o.entfernung,
        "von_datum": _zeit(o.von_datum),
        "bis_datum": _zeit(o.bis_datum),
        "ist_selbst": o.ist_selbst,
        "ueber_budget": sv.ueber_budget(ctx.reise, ent.baustein, o),
        "stimmen": zaehler,
        "waehler": {w: sorted(n) for w, n in waehler.items()} if hat_stimmen_sicht else None,
        "meine": meine,
        "kann_loeschen": ctx.darf_verwalten or o.vorgeschlagen_von_id == ctx.user.pk,
    }


def entscheidung_dict(ent, ctx) -> dict:
    # Abstimmung nicht anonym : alle Stimmberechtigten sehen, wer wofür ist.
    sicht = ctx.voll
    optionen = list(ent.optionen.all())
    if ent.typ == EntscheidungTyp.TERMIN:
        optionen = sv.termin_rang(optionen)
    waehler = {s.user_id for o in optionen for s in o.stimmen.all()}
    status = (
        "beschlossen"
        if ent.status == EntStatus.BESCHLOSSEN
        else "geschlossen" if ent.geschlossen else "offen"
    )
    beschluss = None
    if ent.status == EntStatus.BESCHLOSSEN:
        opt = next((o for o in optionen if o.id == ent.beschluss_option_id), None)
        beschluss = {
            "option": str(opt.id) if opt else None,
            "titel": opt.titel if opt else None,
            "von_datum": _zeit(opt.von_datum) if opt else None,
            "bis_datum": _zeit(opt.bis_datum) if opt else None,
            "link": opt.link if opt else "",
            "preis": f"{opt.preis:.2f}" if opt and opt.preis is not None else None,
            "preis_einheit": opt.preis_einheit if opt else "",
            "entfernung": opt.entfernung if opt else "",
            "begruendung": ent.begruendung,
            "am": _zeit(ent.beschlossen_am),
            "folgen": sv.folgen(ent),
        }
    vorschlag = sv.vorschlag_option(ent) if status == "geschlossen" else None
    return {
        "id": str(ent.id),
        "typ": ent.typ,
        "baustein": ent.baustein,
        "titel": ent.titel,
        "beschreibung": ent.beschreibung,
        "mehrfach": ent.mehrfach,
        "frist": _zeit(ent.frist),
        "status": status,
        "optionen": [option_dict(ent, o, ctx, sicht) for o in optionen] if sicht else [],
        "beschluss": beschluss,
        "vorschlag": str(vorschlag.id) if vorschlag else None,
        "teilgenommen": len(waehler),
        "ich_habe_abgestimmt": ctx.user.pk in waehler,
        **_gruppe(ent),
    }


def info_dict(info, ctx, gelesen_ids=None) -> dict:
    gelesen = info.id in (gelesen_ids or set())
    d = {
        "id": str(info.id),
        "titel": info.titel,
        "text": info.text,
        "wichtig": info.wichtig,
        "gueltig_bis": _zeit(info.gueltig_bis),
        "gelesen_pflicht": info.gelesen_pflicht,
        "gelesen": gelesen,
        "erstellt": _zeit(info.created_at),
        **_gruppe(info),
    }
    if ctx.darf_verwalten and info.gelesen_pflicht:
        namen = {g.user_id for g in info.gelesen.all()}
        d["ausstehend"] = sorted(
            sv.name_von(u)
            for u in sv.empfaenger(info.reise, info.teilgruppe_id)
            if u.pk not in namen
        )
    return d


def aufgabe_dict(a) -> dict:
    ueberfaellig = (
        a.frist is not None and a.status != AStatus.ERLEDIGT and a.frist < timezone.localdate()
    )
    return {
        "id": str(a.id),
        "titel": a.titel,
        "beschreibung": a.beschreibung,
        "verantwortlich": str(a.verantwortlich_id) if a.verantwortlich_id else None,
        "verantwortlich_name": sv.name_von(a.verantwortlich) if a.verantwortlich_id else None,
        "frist": _zeit(a.frist),
        "status": a.status,
        "ueberfaellig": ueberfaellig,
        **_gruppe(a),
    }


def teilnehmer_dict(tn, ctx) -> dict:
    eigen = ctx.tn is not None and ctx.tn.pk == tn.pk
    d = {
        "id": str(tn.id),
        "user": str(tn.user_id),
        "name": sv.name_von(tn.user),
        "rolle": tn.rolle,
        "status": tn.status,
        "begleitpersonen": tn.begleitpersonen,
    }
    if ctx.darf_verwalten and tn.status == TStatus.ANGEFRAGT:
        d["nachricht"] = tn.nachricht
    if not ctx.voll:
        return d
    d["etappen"] = sv.etappen_sichtbar(ctx, tn)
    d["unterkunft"] = sv.unterkunft_sichtbar(ctx, tn)
    if eigen or (ctx.orga and not tn.verbergen_vor_orga):
        d.update(
            stadionkarte=tn.stadionkarte,
            dokument_gueltig=tn.dokument_gueltig,
            regeln_bestaetigt=bool(tn.regeln_bestaetigt_am),
            notiz=tn.notiz,
        )
    return d


def meine_angaben(tn) -> dict:
    return {
        "id": str(tn.id),
        "status": tn.status,
        "rolle": tn.rolle,
        "begleitpersonen": tn.begleitpersonen,
        "freigabe_hin": tn.freigabe_hin,
        "freigabe_rueck": tn.freigabe_rueck,
        "freigabe_unterkunft": tn.freigabe_unterkunft,
        "verbergen_vor_orga": tn.verbergen_vor_orga,
        "unterkunft": str(tn.unterkunft_id) if tn.unterkunft_id else None,
        "unterkunft_eigen": tn.unterkunft_eigen,
        "unterkunft_gebucht": tn.unterkunft_gebucht,
        "stadionkarte": tn.stadionkarte,
        "dokument_gueltig": tn.dokument_gueltig,
        "regeln_bestaetigt_am": _zeit(tn.regeln_bestaetigt_am),
        "notiz": tn.notiz,
        "geburtsdatum": _zeit(tn.geburtsdatum),
        "offen_gemeinsame_anreise": tn.offen_gemeinsame_anreise,
        "etappen": [sv.etappe_dict(e, voll=True) for e in tn.etappen.all()],
    }


def jetzt_dran(ctx, entscheidungen, aufgaben, infos, gelesen_ids) -> list[dict]:
    """Persönliche To-dos : was jetzt von dir erwartet wird, nach Dringlichkeit."""
    punkte = []
    heute = timezone.localdate()
    if ctx.voll:
        for e in entscheidungen:
            if e.status == EntStatus.OFFEN and not e.geschlossen:
                if not any(
                    s.user_id == ctx.user.pk for o in e.optionen.all() for s in o.stimmen.all()
                ):
                    punkte.append(
                        {
                            "art": "abstimmen",
                            "id": str(e.id),
                            "titel": e.titel,
                            "frist": _zeit(e.frist),
                        }
                    )
        for a in aufgaben:
            if a.status != AStatus.ERLEDIGT and a.frist and a.frist < heute:
                if a.verantwortlich_id == ctx.user.pk or ctx.darf_verwalten:
                    punkte.append(
                        {
                            "art": "aufgabe_ueberfaellig",
                            "id": str(a.id),
                            "titel": a.titel,
                            "frist": _zeit(a.frist),
                        }
                    )
        for i in infos:
            if i.gelesen_pflicht and i.id not in gelesen_ids:
                punkte.append(
                    {
                        "art": "info_lesen",
                        "id": str(i.id),
                        "titel": i.titel,
                        "frist": None,
                    }
                )
        if ctx.reise.regeln and ctx.tn and not ctx.tn.regeln_bestaetigt_am:
            punkte.append(
                {
                    "art": "regeln",
                    "id": None,
                    "titel": "Regeln bestätigen",
                    "frist": None,
                }
            )
        if ctx.tn and ctx.tn.status == TStatus.DABEI:
            if (
                not sv.hat_gebucht(ctx.tn, "hin")
                and not ctx.tn.etappen.filter(richtung="hin").exists()
            ):
                punkte.append(
                    {
                        "art": "hinreise",
                        "id": None,
                        "titel": "Hinreise eintragen",
                        "frist": None,
                    }
                )
    if ctx.darf_verwalten:
        n = ctx.reise.teilnehmer.filter(status=TStatus.ANGEFRAGT).count()
        if n:
            punkte.append(
                {
                    "art": "anfragen",
                    "id": None,
                    "titel": f"{n} offene Anfrage(n)",
                    "frist": None,
                }
            )
    return punkte
