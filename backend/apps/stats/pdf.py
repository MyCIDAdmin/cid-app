"""
Génération du PDF "Dashboard" — app stats (demande utilisateur du 2026-09-25, module
"Statistiken & KPIs" : "Export als PDF/Excel-Dashboard"). Même principe que apps.cotisations.pdf/
apps.boutique.pdf : un seul gabarit HTML (templates/stats/dashboard_pdf.html) rendu via
WeasyPrint, dans la langue de préférence de l'utilisateur qui exporte (accounts.User.
langue_preferee), portée FR/DE (l'arabe reste Phase 5 — voir docstring de apps.cotisations.pdf
pour le raisonnement complet, identique ici).

Contrairement aux reçus/factures (documents liés à UN enregistrement), ce PDF résume les 3
onglets du tableau de bord (Financier/Membres/Événements) pour les filtres actifs au moment de
l'export — un tableau de chiffres, pas une copie des graphiques (WeasyPrint ne sait pas
rendre les <canvas>/SVG de Recharts), cohérent avec les autres PDF déjà générés par
l'application, tous tabulaires plutôt qu'une capture d'écran.
"""

import base64
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from django.template.loader import render_to_string
from weasyprint import HTML

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"

TRADUCTIONS = {
    "fr": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Supporters en Allemagne",
        "title": "Tableau de bord — Statistiques & KPIs",
        "indicateur": "Indicateur",
        "valeur": "Valeur",
        "section_financier": "Financier",
        "section_membres": "Membres",
        "section_evenements": "Événements",
        "section_top_contributeurs": "Top contributeurs",
        "membre": "Membre",
        "total": "Total",
        "footer_note": (
            "Document généré automatiquement à partir des filtres actifs au moment de "
            "l'export — les montants reflètent uniquement les écritures déjà comptabilisées."
        ),
        "footer_page": "Clubistes in Deutschland — Statistiken & KPIs",
        "libelles_financier": {
            "solde": "Solde",
            "recettes": "Recettes",
            "depenses": "Dépenses",
            "taux_collecte": "Taux de collecte",
            "cotisations_en_attente": "Cotisations en attente",
            "revenus_boutique": "Revenus boutique",
            "revenus_adhesions": "Revenus adhésions",
            "revenus_evenements": "Revenus événements",
        },
        "libelles_membres": {
            "total": "Total",
            "actifs": "Actifs",
            "inactifs": "Inactifs",
        },
        "libelles_evenements": {
            "nombre_evenements": "Nombre d'événements",
            "taux_remplissage_moyen": "Taux de remplissage moyen",
            "inscriptions_totales": "Inscriptions totales",
            "revenus": "Revenus",
        },
    },
    "de": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Anhänger in Deutschland",
        "title": "Dashboard — Statistiken & KPIs",
        "indicateur": "Kennzahl",
        "valeur": "Wert",
        "section_financier": "Finanzen",
        "section_membres": "Mitglieder",
        "section_evenements": "Veranstaltungen",
        "section_top_contributeurs": "Top-Beitragende",
        "membre": "Mitglied",
        "total": "Gesamt",
        "footer_note": (
            "Automatisch erstelltes Dokument, basierend auf den zum Exportzeitpunkt aktiven "
            "Filtern — die Beträge umfassen nur bereits verbuchte Vorgänge."
        ),
        "footer_page": "Clubistes in Deutschland — Statistiken & KPIs",
        "libelles_financier": {
            "solde": "Saldo",
            "recettes": "Einnahmen",
            "depenses": "Ausgaben",
            "taux_collecte": "Einzugsquote",
            "cotisations_en_attente": "Ausstehende Beiträge",
            "revenus_boutique": "Shop-Einnahmen",
            "revenus_adhesions": "Mitgliedschafts-Einnahmen",
            "revenus_evenements": "Veranstaltungs-Einnahmen",
        },
        "libelles_membres": {
            "total": "Gesamt",
            "actifs": "Aktiv",
            "inactifs": "Inaktiv",
        },
        "libelles_evenements": {
            "nombre_evenements": "Anzahl Veranstaltungen",
            "taux_remplissage_moyen": "Durchschnittliche Auslastung",
            "inscriptions_totales": "Anmeldungen gesamt",
            "revenus": "Einnahmen",
        },
    },
}


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Voir apps.cotisations.pdf._logo_data_uri — même raison (évite toute dépendance à
    STATIC_URL pour WeasyPrint), copie locale de l'asset pour l'autonomie de chaque app."""
    contenu = (_ASSETS_DIR / "logo_cid.jpg").read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(contenu).decode('ascii')}"


def _formate_montant(montant) -> str:
    montant = Decimal(str(montant))
    valeur = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return f"{valeur} €"


def _resoudre_langue(user) -> str:
    """Même principe que apps.cotisations.pdf._resoudre_langue — voir sa docstring."""
    return user.langue_preferee if user and user.langue_preferee in TRADUCTIONS else "fr"


TEXTE_DASHBOARD = {
    "de": {
        "erstellt": "Erstellt am",
        "ueberblick": "Überblick",
        "kpi_saldo": "Saldo",
        "kpi_einnahmen": "Einnahmen",
        "kpi_ausgaben": "Ausgaben",
        "kpi_einzug": "Einzugsquote",
        "kpi_mitglieder": "Mitglieder aktiv",
        "kpi_veranstaltungen": "Veranstaltungen",
        "kpi_projekte": "Projekte",
        "chart_einnahmen_quellen": "Einnahmen nach Quelle",
        "chart_monat": "Einnahmen und Ausgaben je Monat",
        "serie_einnahmen": "Einnahmen",
        "serie_ausgaben": "Ausgaben",
        "quelle_shop": "Shop",
        "quelle_mitgliedschaften": "Mitgliedschaften",
        "quelle_veranstaltungen": "Veranstaltungen",
        "quelle_projekte": "Projekte",
        "quelle_sonstige": "Beiträge / Spenden / Sonstige",
        "finanzdaten": "Finanzdaten (Detail)",
        "datum": "Datum",
        "typ": "Typ",
        "mitglied": "Mitglied / Partei",
        "beschreibung": "Beschreibung",
        "betrag": "Betrag",
        "status": "Status",
        "gekuerzt": "Es werden die ersten {n} Buchungen angezeigt; vollständig im Excel-Export.",
        "keine_daten": "Keine Daten für diesen Zeitraum.",
        "chart_aktiv": "Aktive und inaktive Mitglieder",
        "aktiv": "Aktiv",
        "inaktiv": "Inaktiv",
        "chart_alter": "Altersverteilung",
        "chart_stadt": "Mitglieder nach Stadt",
        "stadt": "Stadt",
        "anzahl": "Anzahl",
        "chart_teilnahme": "Teilnahme je Veranstaltung",
        "serie_reserviert": "Reservierte Plätze",
        "serie_max": "Maximale Plätze",
        "veranstaltung": "Veranstaltung",
        "plaetze": "Plätze",
        "nach_typ": "Verteilung nach Typ",
        "projekt": "Projekt",
        "aufgaben": "Aufgaben",
        "plan": "Plan",
        "ist": "Ist",
        "offen": "Offen",
        "einnahmen": "Einnahmen",
        "ergebnis": "Ergebnis",
        "chart_projektstatus": "Projekte nach Status",
        "aufgabenfortschritt": "Aufgabenfortschritt",
        "kosten_gesamt": "Kosten gesamt",
        "ueberfaellig": "überfällig",
        "alter_jahre": "{a}–{b} Jahre",
        "alter_plus": "{a}+ Jahre",
    },
    "fr": {
        "erstellt": "Généré le",
        "ueberblick": "Aperçu",
        "kpi_saldo": "Solde",
        "kpi_einnahmen": "Recettes",
        "kpi_ausgaben": "Dépenses",
        "kpi_einzug": "Taux de collecte",
        "kpi_mitglieder": "Membres actifs",
        "kpi_veranstaltungen": "Événements",
        "kpi_projekte": "Projets",
        "chart_einnahmen_quellen": "Recettes par source",
        "chart_monat": "Recettes et dépenses par mois",
        "serie_einnahmen": "Recettes",
        "serie_ausgaben": "Dépenses",
        "quelle_shop": "Boutique",
        "quelle_mitgliedschaften": "Adhésions",
        "quelle_veranstaltungen": "Événements",
        "quelle_projekte": "Projets",
        "quelle_sonstige": "Cotisations / dons / autres",
        "finanzdaten": "Données financières (détail)",
        "datum": "Date",
        "typ": "Type",
        "mitglied": "Membre / partie",
        "beschreibung": "Description",
        "betrag": "Montant",
        "status": "Statut",
        "gekuerzt": (
            "Les {n} premières écritures sont affichées ; liste complète dans l'export Excel."
        ),
        "keine_daten": "Aucune donnée pour cette période.",
        "chart_aktiv": "Membres actifs et inactifs",
        "aktiv": "Actifs",
        "inaktiv": "Inactifs",
        "chart_alter": "Répartition par âge",
        "chart_stadt": "Membres par ville",
        "stadt": "Ville",
        "anzahl": "Nombre",
        "chart_teilnahme": "Participation par événement",
        "serie_reserviert": "Places réservées",
        "serie_max": "Places maximum",
        "veranstaltung": "Événement",
        "plaetze": "Places",
        "nach_typ": "Répartition par type",
        "projekt": "Projet",
        "aufgaben": "Tâches",
        "plan": "Prévu",
        "ist": "Réel",
        "offen": "Ouvert",
        "einnahmen": "Recettes",
        "ergebnis": "Résultat",
        "chart_projektstatus": "Projets par statut",
        "aufgabenfortschritt": "Avancement des tâches",
        "kosten_gesamt": "Coûts total",
        "ueberfaellig": "en retard",
        "alter_jahre": "{a}–{b} ans",
        "alter_plus": "{a}+ ans",
    },
}

MAX_FINANZZEILEN = 300
_MONATE = {
    "de": ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    "fr": [
        "Janv",
        "Févr",
        "Mars",
        "Avr",
        "Mai",
        "Juin",
        "Juil",
        "Août",
        "Sept",
        "Oct",
        "Nov",
        "Déc",
    ],
}


def _monatsname(mois, langue) -> str:
    try:
        return _MONATE[langue][int(mois) - 1]
    except (ValueError, IndexError, KeyError):
        return str(mois)


def generate_dashboard_pdf(
    *,
    kpis_financier,
    kpis_membres,
    kpis_evenements,
    user=None,
    filtres_affiches: str,
    langue: str | None = None,
    kpis_projets=None,
    finances=None,
    mensuel=None,
) -> bytes:
    """Komplettes Dashboard als PDF : Kennzahlen-Kacheln, Diagramme (server-seitig als SVG) und
    Detailtabellen für Finanzen, Mitglieder, Veranstaltungen und Projekte. `kpis_*` sind vom
    Aufrufer bereits berechnet/gefiltert (siehe apps.stats.views.StatsExportPdfView) ;
    `langue` (de/fr) hat Vorrang vor der gespeicherten Nutzersprache."""
    from django.utils import timezone

    from . import charts, i18n

    langue = langue if langue in TRADUCTIONS else _resoudre_langue(user)
    t = TRADUCTIONS[langue]
    d = TEXTE_DASHBOARD[langue]
    m = _formate_montant
    lib = t["libelles_financier"]

    lignes_financier = [
        (lib["solde"], m(kpis_financier["solde"])),
        (lib["recettes"], m(kpis_financier["recettes"])),
        (lib["depenses"], m(kpis_financier["depenses"])),
        (lib["taux_collecte"], f"{kpis_financier['taux_collecte']} %"),
        (lib["cotisations_en_attente"], m(kpis_financier["cotisations_en_attente"])),
        (lib["revenus_boutique"], m(kpis_financier["revenus_boutique"])),
        (lib["revenus_adhesions"], m(kpis_financier["revenus_adhesions"])),
        (lib["revenus_evenements"], m(kpis_financier["revenus_evenements"])),
    ]
    lignes_membres = [
        (t["libelles_membres"]["total"], kpis_membres["total"]),
        (t["libelles_membres"]["actifs"], kpis_membres["actifs"]),
        (t["libelles_membres"]["inactifs"], kpis_membres["inactifs"]),
    ]
    le = t["libelles_evenements"]
    lignes_evenements = [
        (le["nombre_evenements"], kpis_evenements["nombre_evenements"]),
        (le["taux_remplissage_moyen"], f"{kpis_evenements['taux_remplissage_moyen']} %"),
        (le["inscriptions_totales"], kpis_evenements["inscriptions_totales"]),
        (le["revenus"], m(kpis_evenements["revenus"])),
    ]
    top_contributeurs = [
        {"nom": ligne["nom"], "total_formate": m(ligne["total"])}
        for ligne in kpis_financier["top_contributeurs"]
    ]

    # --- Kacheln -------------------------------------------------------------------------
    kacheln = [
        (d["kpi_saldo"], m(kpis_financier["solde"])),
        (d["kpi_einnahmen"], m(kpis_financier["recettes"])),
        (d["kpi_ausgaben"], m(kpis_financier["depenses"])),
        (d["kpi_einzug"], f"{kpis_financier['taux_collecte']} %"),
        (d["kpi_mitglieder"], kpis_membres["actifs"]),
        (d["kpi_veranstaltungen"], kpis_evenements["nombre_evenements"]),
    ]
    if kpis_projets is not None:
        kacheln.append((d["kpi_projekte"], kpis_projets["projekte_gesamt"]))

    # --- Finanzen: Diagramme -------------------------------------------------------------
    quellen = [
        (d["quelle_shop"], kpis_financier["revenus_boutique"]),
        (d["quelle_mitgliedschaften"], kpis_financier["revenus_adhesions"]),
        (d["quelle_veranstaltungen"], kpis_financier["revenus_evenements"]),
        (d["quelle_projekte"], kpis_financier.get("revenus_projets", 0)),
    ]
    sonstige = Decimal(str(kpis_financier["recettes"])) - sum(
        (Decimal(str(w)) for _, w in quellen), Decimal("0")
    )
    if sonstige > 0:
        quellen.append((d["quelle_sonstige"], sonstige))
    diagramm_quellen = charts.balken_horizontal(
        [(n, float(w)) for n, w in quellen if float(w) > 0], formatierer=m
    )
    diagramm_monat = ""
    if mensuel:
        diagramm_monat = charts.balken_gruppiert(
            [_monatsname(x["mois"], langue) for x in mensuel],
            [
                (d["serie_einnahmen"], charts.ROT, [float(x["recettes"]) for x in mensuel]),
                (d["serie_ausgaben"], charts.GRAU, [float(x["depenses"]) for x in mensuel]),
            ],
        )

    # --- Finanzdetail --------------------------------------------------------------------
    finanzzeilen, finanz_gekuerzt = [], False
    if finances:
        finanz_gekuerzt = len(finances) > MAX_FINANZZEILEN
        for z in finances[:MAX_FINANZZEILEN]:
            finanzzeilen.append(
                {
                    "datum": z["date"].strftime("%d.%m.%Y"),
                    "typ": i18n.typ(z["type"], langue),
                    "partei": z["membre_nom"],
                    "beschreibung": z["description"],
                    "betrag": m(z["montant"]),
                    "negativ": z["montant"] < 0,
                    "status": i18n.status(z["statut"], langue),
                }
            )

    # --- Mitglieder ----------------------------------------------------------------------
    diagramm_aktiv = charts.ring(
        [(d["aktiv"], kpis_membres["actifs"]), (d["inaktiv"], kpis_membres["inactifs"])]
    )
    alter = []
    for z in kpis_membres["pyramide_ages"]:
        if z.get("age_min") is not None and z.get("age_max") is not None:
            label = d["alter_jahre"].format(a=z["age_min"], b=z["age_max"])
        elif z.get("age_min") is not None:
            label = d["alter_plus"].format(a=z["age_min"])
        else:
            label = z["tranche"]
        alter.append((label, z["nombre"]))
    diagramm_alter = charts.balken_horizontal(alter, formatierer=lambda v: f"{v:g}")
    staedte = [(z["ville_de"], z["nombre"]) for z in kpis_membres["par_ville"][:15]]
    diagramm_staedte = charts.balken_horizontal(staedte[:10], formatierer=lambda v: f"{v:g}")

    # --- Veranstaltungen -----------------------------------------------------------------
    teilnahme = kpis_evenements["participation_par_evenement"][:12]
    diagramm_teilnahme = ""
    if teilnahme:
        diagramm_teilnahme = charts.balken_gruppiert(
            [e["titre"] for e in teilnahme],
            [
                (d["serie_reserviert"], charts.ROT, [e["places_reservees"] for e in teilnahme]),
                (d["serie_max"], charts.GRAU, [e["places_max"] or 0 for e in teilnahme]),
            ],
        )
    ereignisse = [
        {
            "titre": e["titre"],
            "reserviert": e["places_reservees"],
            "max": e["places_max"] if e["places_max"] is not None else "∞",
        }
        for e in kpis_evenements["participation_par_evenement"]
    ]
    nach_typ = [
        (i18n.event_typ(z["type_evenement"], langue), z["nombre"])
        for z in kpis_evenements["par_type"]
    ]

    # --- Projekte ------------------------------------------------------------------------
    projekte = None
    if kpis_projets is not None:
        k = kpis_projets["kosten"]
        projekte = {
            "status_ring": charts.ring(
                [
                    (i18n.status(z["statut"], langue), z["nombre"])
                    for z in kpis_projets["nach_status"]
                ]
            ),
            "fortschritt": charts.fortschritt(kpis_projets["aufgaben"]["quote"]),
            "quote": kpis_projets["aufgaben"]["quote"],
            "aufgaben": kpis_projets["aufgaben"],
            "kosten": [
                (d["plan"], m(k["plan"])),
                (d["ist"], m(k["ist"])),
                (d["offen"], m(k["offen"])),
                (d["einnahmen"], m(k["einnahmen"])),
                (d["ergebnis"], m(k["ergebnis"])),
            ],
            "zeilen": [
                {
                    "titre": z["titre"],
                    "status": i18n.status(z["statut"], langue),
                    "aufgaben": f"{z['aufgaben_erledigt']}/{z['aufgaben_gesamt']}",
                    "plan": m(z["plan"]),
                    "ist": m(z["ist"]),
                    "einnahmen": m(z["einnahmen"]),
                    "ergebnis": m(z["ergebnis"]),
                }
                for z in kpis_projets["projekte"]
            ],
        }

    contexte = {
        "langue": langue,
        "t": t,
        "d": d,
        "erstellt": timezone.localtime().strftime("%d.%m.%Y %H:%M"),
        "logo_data_uri": _logo_data_uri(),
        "subtitre_filtres": filtres_affiches,
        "kacheln": kacheln,
        "lignes_financier": lignes_financier,
        "lignes_membres": lignes_membres,
        "lignes_evenements": lignes_evenements,
        "top_contributeurs": top_contributeurs,
        "diagramm_quellen": diagramm_quellen,
        "diagramm_monat": diagramm_monat,
        "finanzzeilen": finanzzeilen,
        "finanz_gekuerzt": finanz_gekuerzt,
        "finanz_max": MAX_FINANZZEILEN,
        "gekuerzt_text": d["gekuerzt"].format(n=MAX_FINANZZEILEN),
        "diagramm_aktiv": diagramm_aktiv,
        "diagramm_alter": diagramm_alter,
        "diagramm_staedte": diagramm_staedte,
        "staedte": staedte,
        "diagramm_teilnahme": diagramm_teilnahme,
        "ereignisse": ereignisse,
        "nach_typ": nach_typ,
        "projekte": projekte,
    }
    html = render_to_string("stats/dashboard_pdf.html", contexte)
    return HTML(string=html).write_pdf()
