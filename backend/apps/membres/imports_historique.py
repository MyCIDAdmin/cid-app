"""
Import Excel de l'HISTORIQUE DE STATUT ASSOCIATIF par année (demande utilisateur du 2026-09-19)
— complète apps.membres.imports (qui crée de nouvelles fiches Membre) : celui-ci met à jour
apps.membres.models.HistoriqueStatutMembre pour des membres DÉJÀ EN BASE, à partir des vraies
données historiques du club (anciens registres/tableurs), plutôt que de s'appuyer uniquement sur
la reconstruction automatique et approximative faite par la migration 0004 (qui ne peut déduire
l'historique qu'à partir des `Cotisation` déjà présentes en base — souvent incomplètes pour les
années les plus anciennes, notamment pré-numérisation).

Format retenu (décision utilisateur, AskUserQuestion du 2026-09-19) : une ligne par membre, une
colonne par année — n'importe quel en-tête reconnu comme un nombre à 4 chiffres plausible
(ANNEE_MIN..ANNEE_MAX) est traité comme une colonne d'année, pas de liste figée à régénérer
chaque année — avec pour valeur "actif"/"inactif" (case ignorée, cellule vide = aucune donnée
pour ce (membre, année), ignorée silencieusement, jamais une erreur).

Identification du membre (décision utilisateur) : email ET cin, tous deux obligatoires dans le
fichier. Si les deux désignent des membres DIFFÉRENTS déjà en base, la ligne est rejetée (ambigu)
plutôt que de deviner lequel des deux privilégier — si un seul des deux correspond (l'autre est
soit absent du fichier soit ne correspond à aucun membre), celui qui correspond suffit.

Cette source fait AUTORITÉ sur les données déjà présentes (décision utilisateur) : une ligne
(membre, année) du fichier écrase silencieusement une éventuelle entrée existante (ex. celle
posée par la migration 0004 ou par un import précédent) si elle diffère — même mécanisme d'upsert
que apps.membres.services.enregistrer_statut_annuel, réutilisé ici avec `notifier_membre=False` :
contrairement à un paiement confirmé ou une échéance dépassée, un import en masse de données
historiques n'est pas un événement personnel pour le membre et ne doit jamais déclencher
notification/email (potentiellement des centaines à la fois).

Zweistufig seit 2026-10-08 (Prüfliste -> Bestätigung -> Bericht, siehe import_gemeinsam) :
`analyser_historique` wertet die Datei aus ohne zu schreiben ; `ausfuehren_historique` schreibt
neue Jahreseinträge immer, überschreibt abweichende bestehende Einträge aber NUR für die vom
Nutzer gewählten Zeilen (Dubletten). Eine Zeile mit einem ungültigen Jahreswert wird als Ganzes
abgelehnt (Fehler) statt teilweise importiert.
"""

import datetime
import logging

from django.db import transaction

from .import_gemeinsam import (
    ERG_FEHLER,
    ERG_IMPORTIERT,
    ERG_TEILWEISE,
    ERG_UEBERSCHRIEBEN,
    ERG_UEBERSPRUNGEN,
    ERG_UNVERAENDERT,
    STATUS_DUBLETTE,
    STATUS_FEHLER,
    STATUS_NEU,
    STATUS_UNVERAENDERT,
    Analyse,
    Ergebnis,
    ImportDateiFehler,
    ZeileAnalyse,
    ZeilenErgebnis,
    erzeuge_bericht,
    lies_kopfzeile_und_zeilen,
    oeffne_arbeitsmappe,
)
from .models import (
    CIN_PLATZHALTER,
    HistoriqueStatutMembre,
    Membre,
    RaisonChangementStatut,
    StatutMembre,
)
from .services import enregistrer_statut_annuel

logger = logging.getLogger(__name__)

ANNEE_MIN = 2000
ANNEE_MAX = 2100  # large marge défensive — un en-tête hors de cette plage n'est simplement pas
# traité comme une colonne d'année (ex. un futur en-tête "total" ou "notes" resterait ignoré).

_STATUT_ALIASES = {"actif": StatutMembre.ACTIF, "inactif": StatutMembre.INACTIF}
_STATUT_TEXT = {StatutMembre.ACTIF: "aktiv", StatutMembre.INACTIF: "inaktiv"}

ART_NEU = "neu"
ART_ABWEICHEND = "abweichend"
ART_GLEICH = "gleich"


def _normalize(value) -> str:
    return str(value).strip().lower() if value is not None else ""


def _map_identite(header_row) -> dict:
    normalized = [_normalize(c) for c in header_row]
    mapping = {}
    for champ, aliases in (("email", ("email", "e-mail", "mail")), ("cin", ("cin",))):
        for idx, header in enumerate(normalized):
            if header in aliases:
                mapping[champ] = idx
                break
    return mapping


def _annees_colonnes(header_row) -> dict:
    """Retourne {annee: index_colonne} pour chaque en-tête reconnu comme une année."""
    annees = {}
    for idx, cell in enumerate(header_row):
        brut = _normalize(cell)
        if brut.isdigit() and ANNEE_MIN <= int(brut) <= ANNEE_MAX:
            annees[int(brut)] = idx
    return annees


def construire_classeur_template_historique():
    """Classeur vierge — email/cin + colonnes d'exemple pour les 6 dernières années écoulées.
    L'import lui-même accepte n'importe quelle colonne d'année (voir docstring de module) : ce
    ne sont que des colonnes d'exemple pour guider la saisie, pas une liste figée."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    annee_courante = datetime.date.today().year
    annees_exemple = list(range(annee_courante - 6, annee_courante))

    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Historique"

    en_tetes = ["email", "cin"] + [str(a) for a in annees_exemple]
    en_tete_style = Font(bold=True, color="FFFFFF")
    remplissage = PatternFill(start_color="CC0000", end_color="CC0000", fill_type="solid")
    for col_idx, champ in enumerate(en_tetes, start=1):
        cellule = feuille.cell(row=1, column=col_idx, value=champ)
        cellule.font = en_tete_style
        cellule.fill = remplissage
        feuille.column_dimensions[cellule.column_letter].width = max(len(champ) + 2, 12)

    exemple = ["riadh.bchini@example.de", "12345678"] + [
        "actif",
        "actif",
        "inactif",
        "actif",
        "actif",
        "actif",
    ]
    for col_idx, valeur in enumerate(exemple, start=1):
        feuille.cell(row=2, column=col_idx, value=valeur)

    notes = classeur.create_sheet("Notes")
    notes["A1"] = (
        "Colonne obligatoire : email. Colonne cin facultative (aide à retrouver un membre "
        "dont l'email a changé). Identifient un membre DÉJÀ EXISTANT."
    )
    notes["A2"] = (
        "Une colonne par année (n'importe quel en-tête numérique à 4 chiffres, ex. 2020, "
        "2021, ...) — valeur : actif / inactif. Cellule vide = aucune donnée pour ce membre "
        "cette année-là (ignorée, pas une erreur)."
    )
    notes["A3"] = (
        "Ce fichier fait AUTORITÉ : une valeur remplace toute entrée déjà existante pour le "
        "même (membre, année), y compris une entrée reconstruite automatiquement."
    )
    notes["A4"] = (
        "Le membre doit déjà exister en base (créé via l'import membres classique ou "
        "manuellement) — cet import ne crée jamais de nouvelle fiche membre."
    )
    notes.column_dimensions["A"].width = 100

    return classeur


def _resoudre_membre(email, cin, cache_email: dict, cache_cin: dict) -> Membre:
    """Retrouve le Membre déjà en base par email et/ou cin. Lève ValueError si ni l'un ni
    l'autre ne correspond à un membre existant, ou si les deux correspondent à des membres
    DIFFÉRENTS (ambigu — jamais deviner lequel privilégier)."""
    email_norm = _normalize(email)
    cin_norm = str(cin).strip() if cin not in (None, "") else ""
    if cin_norm == CIN_PLATZHALTER:  # Platzhalter = keine echte CIN
        cin_norm = ""

    membre_email = cache_email.get(email_norm) if email_norm else None
    membre_cin = cache_cin.get(cin_norm) if cin_norm else None

    if membre_email and membre_cin and membre_email.id != membre_cin.id:
        raise ValueError(f"E-Mail {email!r} und CIN {cin!r} gehören zu 2 verschiedenen Mitgliedern")
    membre = membre_email or membre_cin
    if membre is None:
        raise ValueError(f"Kein bestehendes Mitglied für E-Mail={email!r} / CIN={cin!r}")
    return membre


def _lade_caches() -> tuple:
    cache_email, cache_cin = {}, {}
    for membre in Membre.objects.select_related("user"):
        cache_email[membre.email.strip().lower()] = membre
        if membre.cin and membre.cin != CIN_PLATZHALTER:
            cache_cin[membre.cin] = membre
    return cache_email, cache_cin


def _bezeichnung(membre: Membre) -> str:
    return f"{membre.numero_membre} ({membre.prenom} {membre.nom})"


def analyser_historique(fichier, dateiname: str = "") -> Analyse:
    """
    PRÜFPHASE — wertet die Datei aus, schreibt nichts. Pro Zeile werden die Jahreswerte mit den
    bereits gespeicherten Einträgen verglichen : neu / abweichend (-> Dublette, wählbar) /
    gleich. Wirft ImportDateiFehler bei unlesbarer Datei oder fehlenden Spalten.
    """
    classeur = oeffne_arbeitsmappe(fichier)
    kopf, daten = lies_kopfzeile_und_zeilen(classeur)

    identite = _map_identite(kopf)
    # cin facultatif depuis le 2026-10-07 (membres sans CIN) : l'email suffit à identifier.
    if "email" not in identite:
        raise ImportDateiFehler("Pflichtspalten fehlen: email")
    annees_colonnes = _annees_colonnes(kopf)
    if not annees_colonnes:
        raise ImportDateiFehler(
            "Keine Jahresspalte erkannt (Kopfzeile mit 4-stelliger Zahl erwartet, z. B. 2024)."
        )

    cache_email, cache_cin = _lade_caches()
    bestehend = {}  # membre_id -> {annee: statut}
    for membre_id, annee, statut in HistoriqueStatutMembre.objects.values_list(
        "membre_id", "annee", "statut"
    ):
        bestehend.setdefault(membre_id, {})[annee] = statut

    gesehen = {}  # membre_id -> Zeilennummer der ersten Fundstelle
    zeilen = []
    for nummer, row in daten:
        email = row[identite["email"]] if identite["email"] < len(row) else None
        cin = row[identite["cin"]] if "cin" in identite and identite["cin"] < len(row) else None
        anzeige = {"prenom": "", "nom": "", "email": str(email or "").strip()}
        try:
            membre = _resoudre_membre(email, cin, cache_email, cache_cin)
        except ValueError as exc:
            zeilen.append(
                ZeileAnalyse(ligne=nummer, status=STATUS_FEHLER, grund=str(exc), anzeige=anzeige)
            )
            continue
        anzeige.update(prenom=membre.prenom, nom=membre.nom)

        if membre.id in gesehen:
            zeilen.append(
                ZeileAnalyse(
                    ligne=nummer,
                    status=STATUS_FEHLER,
                    grund=(
                        "Mitglied kommt in der Datei mehrfach vor "
                        f"(bereits in Zeile {gesehen[membre.id]})"
                    ),
                    anzeige=anzeige,
                    existant=membre,
                )
            )
            continue
        gesehen[membre.id] = nummer

        eintraege, fehler = [], []
        vorhanden = bestehend.get(membre.id, {})
        for annee in sorted(annees_colonnes):
            idx = annees_colonnes[annee]
            roh = row[idx] if idx < len(row) else None
            wert = _normalize(roh)
            if not wert:
                continue  # leere Zelle : keine Angabe für dieses Jahr
            statut = _STATUT_ALIASES.get(wert)
            if statut is None:
                fehler.append(f"Jahr {annee}: ungültiger Wert {roh!r}")
                continue
            alt = vorhanden.get(annee)
            if alt is None:
                art = ART_NEU
            elif alt == statut:
                art = ART_GLEICH
            else:
                art = ART_ABWEICHEND
            eintraege.append((annee, statut, alt, art))

        if fehler:
            zeilen.append(
                ZeileAnalyse(
                    ligne=nummer,
                    status=STATUS_FEHLER,
                    grund="; ".join(fehler),
                    anzeige=anzeige,
                    existant=membre,
                )
            )
            continue

        aenderungen = [
            {
                "champ": str(annee),
                "label": str(annee),
                "alt": _STATUT_TEXT[alt] if alt else "",
                "neu": _STATUT_TEXT[statut],
                "art": art,
            }
            for annee, statut, alt, art in eintraege
            if art != ART_GLEICH
        ]
        abweichend = any(art == ART_ABWEICHEND for *_, art in eintraege)
        if not eintraege:
            status, grund = STATUS_UNVERAENDERT, "Keine Jahreswerte in dieser Zeile"
        elif not aenderungen:
            status, grund = STATUS_UNVERAENDERT, "Alle Jahre sind bereits identisch vorhanden"
        elif abweichend:
            status = STATUS_DUBLETTE
            anzahl = sum(1 for *_, art in eintraege if art == ART_ABWEICHEND)
            grund = f"{anzahl} bestehende(r) Jahreseintrag/-einträge weicht/weichen ab"
        else:
            status = STATUS_NEU
            grund = f"{len(aenderungen)} neue(r) Jahreseintrag/-einträge"
        zeilen.append(
            ZeileAnalyse(
                ligne=nummer,
                status=status,
                grund=grund,
                anzeige=anzeige,
                existant=membre,
                aenderungen=aenderungen,
                daten=eintraege,
            )
        )

    return Analyse(zeilen=zeilen, classeur=classeur, dateiname=dateiname)


def _schreibe(membre: Membre, eintraege) -> None:
    # Ordre chronologique croissant : enregistrer_statut_annuel ne fait progresser le statut
    # COURANT que vers l'année la plus récente déjà connue.
    for annee, statut, _alt, _art in sorted(eintraege):
        enregistrer_statut_annuel(
            membre,
            annee,
            statut,
            RaisonChangementStatut.MANUEL,
            date_effet=datetime.datetime(annee, 1, 1, tzinfo=datetime.timezone.utc),
            notifier_membre=False,  # Massenimport : nie Benachrichtigung/E-Mail (siehe Docstring)
        )


def ausfuehren_historique(fichier, ueberschreiben, dateiname: str = "") -> Ergebnis:
    """
    BESTÄTIGUNGSPHASE — erneute Auswertung, dann : neue Jahreseinträge werden immer
    geschrieben, abweichende bestehende nur für Zeilennummern in `ueberschreiben`. Liefert den
    Bericht (Originaldatei + Status/Grund).
    """
    ueberschreiben = set(ueberschreiben or ())
    analyse = analyser_historique(fichier, dateiname)

    ergebnisse = []
    for zeile in analyse.zeilen:
        if zeile.status == STATUS_FEHLER:
            ergebnisse.append(ZeilenErgebnis(zeile.ligne, ERG_FEHLER, zeile.grund))
        elif zeile.status == STATUS_UNVERAENDERT:
            ergebnisse.append(ZeilenErgebnis(zeile.ligne, ERG_UNVERAENDERT, zeile.grund))
        else:
            ergebnisse.append(_zeile_schreiben(zeile, zeile.ligne in ueberschreiben))

    name, inhalt = erzeuge_bericht(analyse.classeur, ergebnisse, dateiname)
    logger.info("import historique: %s Zeilen verarbeitet", len(ergebnisse))
    return Ergebnis(zeilen=ergebnisse, bericht_name=name, bericht_bytes=inhalt)


def _jahre(eintraege) -> str:
    return ", ".join(str(e[0]) for e in eintraege)


def _zeile_schreiben(zeile: ZeileAnalyse, ueberschreiben: bool) -> ZeilenErgebnis:
    neue = [e for e in zeile.daten if e[3] == ART_NEU]
    abweichende = [e for e in zeile.daten if e[3] == ART_ABWEICHEND]
    zu_schreiben = neue + (abweichende if ueberschreiben else [])

    if zu_schreiben:
        try:
            with transaction.atomic():
                _schreibe(zeile.existant, zu_schreiben)
        except Exception:  # noqa: BLE001 — eine fehlerhafte Zeile darf den Rest nicht stoppen
            logger.exception("import historique: Zeile %s nicht gespeichert", zeile.ligne)
            return ZeilenErgebnis(zeile.ligne, ERG_FEHLER, "Technischer Fehler beim Speichern")

    if zeile.status == STATUS_NEU:
        return ZeilenErgebnis(zeile.ligne, ERG_IMPORTIERT, f"Jahre importiert: {_jahre(neue)}")
    if ueberschreiben:
        grund = f"Jahre überschrieben: {_jahre(abweichende)}"
        if neue:
            grund += f" ; neu importiert: {_jahre(neue)}"
        return ZeilenErgebnis(zeile.ligne, ERG_UEBERSCHRIEBEN, grund)
    nicht = f"Dublette — nicht zum Überschreiben ausgewählt (Jahre: {_jahre(abweichende)})"
    if neue:
        return ZeilenErgebnis(
            zeile.ligne, ERG_TEILWEISE, f"{nicht} ; neu importiert: {_jahre(neue)}"
        )
    return ZeilenErgebnis(zeile.ligne, ERG_UEBERSPRUNGEN, nicht)
