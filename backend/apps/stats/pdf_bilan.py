"""PDF Jahresbilanz (2026-10-06) — même gabarit visuel que le PDF dashboard, FR/DE selon la langue
de l'utilisateur (l'arabe reste hors périmètre, comme pour tous les PDF de l'application),
avec un graphique mensuel en SVG inline (rendu correctement par WeasyPrint)."""

from django.template.loader import render_to_string
from weasyprint import HTML

from .pdf import TRADUCTIONS as _TRAD_BASE
from .pdf import _formate_montant, _logo_data_uri, _resoudre_langue

TEXTES = {
    "fr": {
        "title": "Bilan annuel",
        "recettes": "Recettes",
        "depenses": "Dépenses",
        "resultat": "Résultat",
        "poste": "Poste",
        "precedent": "Année préc.",
        "budget": "Budget",
        "ecart": "Écart",
        "evenements": "Résultat par événement",
        "projets": "Résultat par projet",
        "mensuel": "Évolution mensuelle",
        "en_attente": "Dépenses en attente d'approbation (non incluses)",
        "abgeschlossen": "Exercice clôturé le",
        "sources": {
            "cotisations": "Cotisations",
            "dons": "Dons",
            "projets": "Contributions aux projets",
            "adhesions": "Adhésions",
            "boutique": "Boutique",
            "evenements": "Événements",
        },
    },
    "de": {
        "title": "Jahresbilanz",
        "recettes": "Einnahmen",
        "depenses": "Ausgaben",
        "resultat": "Ergebnis",
        "poste": "Posten",
        "precedent": "Vorjahr",
        "budget": "Budget",
        "ecart": "Abweichung",
        "evenements": "Ergebnis je Veranstaltung",
        "projets": "Ergebnis je Projekt",
        "mensuel": "Monatsverlauf",
        "en_attente": "Ausgaben zur Freigabe ausstehend (nicht enthalten)",
        "abgeschlossen": "Geschäftsjahr abgeschlossen am",
        "sources": {
            "cotisations": "Mitgliedsbeiträge",
            "dons": "Spenden",
            "projets": "Projektbeiträge",
            "adhesions": "Mitgliedschaften",
            "boutique": "Shop",
            "evenements": "Veranstaltungen",
        },
    },
}


def _graphique_mensuel(mensuel) -> str:
    """Barres groupées recettes (rouge CID) / dépenses (gris) — SVG autonome."""
    largeur, hauteur, marge = 520, 150, 18
    maxi = max(
        [float(m["recettes"]) for m in mensuel] + [float(m["depenses"]) for m in mensuel] + [1.0]
    )
    pas = (largeur - 2 * marge) / 12
    barres = []
    for i, m in enumerate(mensuel):
        x = marge + i * pas
        for j, (cle, couleur) in enumerate((("recettes", "#CC0000"), ("depenses", "#8a8a8a"))):
            h = float(m[cle]) / maxi * (hauteur - 2 * marge)
            barres.append(
                f'<rect x="{x + j * pas * 0.4 + pas * 0.1:.1f}" y="{hauteur - marge - h:.1f}" '
                f'width="{pas * 0.35:.1f}" height="{h:.1f}" fill="{couleur}"/>'
            )
        barres.append(
            f'<text x="{x + pas / 2:.1f}" y="{hauteur - 5}" font-size="8" fill="#555" '
            f'text-anchor="middle">{m["mois"]}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" '
        f'viewBox="0 0 {largeur} {hauteur}">'
        f'<line x1="{marge}" y1="{hauteur - marge}" x2="{largeur - marge}" y2="{hauteur - marge}" '
        f'stroke="#ccc"/>{"".join(barres)}</svg>'
    )


def generate_bilan_pdf(*, bilan, user) -> bytes:
    langue = _resoudre_langue(user)
    t = {**_TRAD_BASE[langue], **TEXTES[langue]}
    m = _formate_montant
    recettes = [
        {
            "nom": t["sources"][r["cle"]],
            "montant": m(r["montant"]),
            "precedent": m(r["montant_precedent"]),
        }
        for r in bilan["recettes"]["lignes"]
    ]
    depenses = [
        {
            "nom": d["nom"],
            "montant": m(d["montant"]),
            "precedent": m(d["montant_precedent"]),
            "budget": m(d["budget"]) if d["budget"] else "—",
            "ecart": m(d["ecart"]) if d["ecart"] is not None else "—",
        }
        for d in bilan["depenses"]["lignes"]
    ]
    contexte = {
        "langue": langue,
        "t": t,
        "annee": bilan["annee"],
        "logo_data_uri": _logo_data_uri(),
        "recettes": recettes,
        "depenses": depenses,
        "total_recettes": m(bilan["recettes"]["total"]),
        "total_recettes_prec": m(bilan["recettes"]["total_precedent"]),
        "total_depenses": m(bilan["depenses"]["total"]),
        "total_depenses_prec": m(bilan["depenses"]["total_precedent"]),
        "budget_total": (
            m(bilan["depenses"]["budget_total"]) if bilan["depenses"]["budget_total"] else "—"
        ),
        "resultat": m(bilan["resultat"]),
        "resultat_prec": m(bilan["resultat_precedent"]),
        "evenements": [
            {
                "titre": e["titre"],
                "recettes": m(e["recettes"]),
                "depenses": m(e["depenses"]),
                "resultat": m(e["resultat"]),
            }
            for e in bilan["resultats_evenements"]
        ],
        "projets": [
            {
                "titre": p["titre"],
                "recettes": m(p["recettes"]),
                "depenses": m(p["depenses"]),
                "resultat": m(p["resultat"]),
            }
            for p in bilan["resultats_projets"]
        ],
        "graphique": _graphique_mensuel(bilan["mensuel"]),
        "en_attente": bilan["depenses_en_attente"],
        "abschluss": bilan["abschluss"],
        "en_attente_montant": m(bilan["depenses_en_attente"]["montant"]),
    }
    return HTML(string=render_to_string("stats/bilan_pdf.html", contexte)).write_pdf()
