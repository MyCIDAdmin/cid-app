/**
 * Onglet "Statistiken"/"Statistiques" — module Fan-Club, COMPLÈTEMENT redessiné en
 * dashboard le 2026-09-24 (retour utilisateur : "Tab Statistiken Komplett Umgestallten",
 * proposition détaillée acceptée telle quelle — voir docstring de tête
 * apps.communaute.models.py pour le contexte complet). Structure "von Oben nach unten" :
 *
 *   1. En-tête équipe (nom/logo/stade/ville/pays/entraîneur/année de fondation), depuis
 *      `EquipeInfo` (`GET /teams/{id}` — endpoint GOAL API JAMAIS testé avec une clé réelle
 *      avant ce déploiement, voir docstring de classe EquipeInfo côté backend) : masqué tant
 *      qu'aucune synchronisation n'a encore eu lieu (`nom` vide).
 *   2. Six cartes KPI (Spiele/Siege/Unentschieden/Niederlagen/Tore/Gegentore), dérivées de la
 *      ligne `ClassementLigue` de Club Africain pour la saison en cours (déjà filtrée côté
 *      backend, voir ClassementLigueViewSet.get_queryset).
 *   3. Liniendiagramm (évolution des points par journée) : la ligne "Club Africain" est une
 *      VRAIE série calculée à partir des rencontres Ligue 1 déjà synchronisées
 *      (`RencontreCalendrier`, barème 3/1/0 points) — "Liga-Durchschnitt"/"Bestes Team der
 *      Liga" sont deux lignes de référence PLATES (instantané du classement actuel, pas une
 *      tendance) : décision explicite de l'utilisateur (AskUserQuestion du 2026-09-24, choix
 *      "Nur Club Africain als echte Linie") après que la recherche a montré que GOAL API ne
 *      fournit qu'un instantané du classement, jamais l'historique points-par-journée de
 *      toutes les équipes de la ligue.
 *   4. Tableau du kader complet, trIABLE par colonne (Name/Position/cartons/buts/matchs/
 *      assists), à partir de `StatistiqueJoueur` — remplace les anciennes listes séparées
 *      Torschützen (top 10)/Kartenstatistik (top 10) : le tri interactif couvre les deux vues
 *      (et bien plus) avec une seule table, sur l'effectif ENTIER (pas seulement le top 10).
 *
 * Palette du Liniendiagramm validée via la skill dataviz (3 séries identitaires, pas un
 * accent + neutre) :
 *   node scripts/validate_palette.js "#CC0000,#2a78d6,#1baf7a" --mode light --pairs all
 *   node scripts/validate_palette.js "#CC0000,#2a78d6,#1baf7a" --mode dark --pairs all
 * → ALL CHECKS PASS dans les deux modes (le mode sombre porte un WARN de contraste sur
 * #CC0000 — non bloquant, mitigé par le texte de repère `punkte_verlauf_hinweis` sous le
 * graphique, qui donne les valeurs de Liga-Durchschnitt/Bestes Team en clair, en plus de la
 * légende — "relief" exigé par la skill pour un WARN de contraste).
 *
 * L'ancien widget "Forme actuelle" (lettres V/N/D) et le graphique de comparaison Buts/
 * Tordifferenz (toutes équipes) ont été retirés : absents de la proposition acceptée par
 * l'utilisateur, et redondants avec les nouvelles cartes KPI/le classement (onglet Tabelle).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconBallFootball } from "@tabler/icons-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useCalendrierRencontres,
  useClassementLigue,
  useEquipeInfo,
  useStatistiquesJoueurs,
} from "../../hooks/useCommunaute";
import type { RencontreCalendrier, StatistiqueJoueur } from "../../types/communaute";

const EQUIPE_SUIVIE = "Club Africain";

// Même filtre de compétition que le module Tippspiel (décision utilisateur explicite du
// 2026-09-24, voir docstring de tête apps.communaute.models.py section Tippspiel et
// services.py::recalculer_points_tippspiel) — GARDE LA MÊME VALEUR pour rester cohérent
// avec cette règle métier déjà en production, plutôt que d'en inventer une nouvelle ici.
// ⚠️ Comme le reste de l'intégration GOAL API, la valeur EXACTE renvoyée par le champ
// "league.name" pour la Ligue 1 tunisienne n'a jamais été confirmée sur une réponse brute
// réelle (les tests backend utilisent un nom d'exemple plausible, voir test_goal_api.py) —
// à vérifier après déploiement avec la clé réelle, en même temps que le reste.
const COMPETITION_LIGUE_1 = "Ligue 1";

// Palette validée dataviz (voir docstring de tête) — Club Africain garde l'accent de marque
// déjà utilisé partout ailleurs dans l'app, Liga-Durchschnitt réutilise le bleu déjà établi
// dans ce même onglet (ex-graphique de comparaison), Bestes Team der Liga prend le 3ème slot
// catégoriel qui passe le validateur aux côtés des deux premiers.
const COULEUR_CLUB_AFRICAIN = "#CC0000";
const COULEUR_LIGA_MOYENNE = "#2a78d6";
const COULEUR_BESTE_EQUIPE = "#1baf7a";

const CLE_LABEL_POSTE: Record<string, string> = {
  Goalkeepers: "live.statistiques_poste_gardien",
  Defenders: "live.statistiques_poste_defenseur",
  Midfielders: "live.statistiques_poste_milieu",
  Forwards: "live.statistiques_poste_attaquant",
};

/** Points (barème 3/1/0) obtenus par l'équipe suivie sur UNE rencontre déjà jouée — ou 0 si
 * un score manque (garde-fou, ne devrait pas arriver pour une rencontre `FINISHED`). */
function pointsMatch(rencontre: RencontreCalendrier): number {
  const estDomicile = rencontre.equipe_domicile === EQUIPE_SUIVIE;
  const notreScore = estDomicile ? rencontre.score_domicile : rencontre.score_exterieur;
  const scoreAdverse = estDomicile ? rencontre.score_exterieur : rencontre.score_domicile;
  if (notreScore === null || scoreAdverse === null) return 0;
  if (notreScore > scoreAdverse) return 3;
  if (notreScore === scoreAdverse) return 1;
  return 0;
}

/** Série cumulative points/journée pour l'équipe suivie — seules les rencontres Ligue 1
 * déjà TERMINÉES avec un score renseigné comptent comme une "journée" (voir constante
 * COMPETITION_LIGUE_1 ci-dessus), triées chronologiquement. */
function construireSeriePointsClubAfricain(rencontres: RencontreCalendrier[]) {
  const terminees = rencontres
    .filter(
      (rencontre) =>
        rencontre.competition === COMPETITION_LIGUE_1 &&
        rencontre.statut === "FINISHED" &&
        rencontre.score_domicile !== null &&
        rencontre.score_exterieur !== null,
    )
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure));

  let cumul = 0;
  return terminees.map((rencontre, index) => {
    cumul += pointsMatch(rencontre);
    return { spieltag: index + 1, clubAfricain: cumul };
  });
}

type ColonneTri =
  | "nom"
  | "poste"
  | "matchs_joues"
  | "buts"
  | "passes_decisives"
  | "cartons_jaunes"
  | "cartons_rouges";

type Direction = "asc" | "desc";

function trierJoueurs(
  joueurs: StatistiqueJoueur[],
  colonne: ColonneTri,
  direction: Direction,
): StatistiqueJoueur[] {
  const facteur = direction === "asc" ? 1 : -1;
  return [...joueurs].sort((a, b) => {
    const valeurA = a[colonne];
    const valeurB = b[colonne];
    if (typeof valeurA === "string" && typeof valeurB === "string") {
      return facteur * valeurA.localeCompare(valeurB);
    }
    return facteur * ((valeurA as number) - (valeurB as number));
  });
}

function KpiCarte({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 text-center shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{valeur}</p>
    </div>
  );
}

function EnTeteTriable({
  colonne,
  label,
  triCle,
  triDirection,
  onTrier,
  className = "",
}: {
  colonne: ColonneTri;
  label: string;
  triCle: ColonneTri;
  triDirection: Direction;
  onTrier: (colonne: ColonneTri) => void;
  className?: string;
}) {
  const actif = colonne === triCle;
  const Icone = actif ? (triDirection === "asc" ? IconArrowUp : IconArrowDown) : IconArrowsSort;
  return (
    <th className={`py-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => onTrier(colonne)}
        aria-sort={actif ? (triDirection === "asc" ? "ascending" : "descending") : "none"}
        className={`flex items-center gap-1 ${className.includes("text-center") ? "mx-auto" : ""} ${
          actif ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
        }`}
      >
        {label}
        <Icone size={12} />
      </button>
    </th>
  );
}

export default function StatistiquesTab() {
  const { t } = useTranslation("communaute");
  const equipeInfoQuery = useEquipeInfo();
  const classementQuery = useClassementLigue();
  const joueursQuery = useStatistiquesJoueurs();
  const calendrierQuery = useCalendrierRencontres();

  const [triCle, setTriCle] = useState<ColonneTri>("buts");
  const [triDirection, setTriDirection] = useState<Direction>("desc");

  function trier(colonne: ColonneTri) {
    if (colonne === triCle) {
      setTriDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      // Premier clic sur une nouvelle colonne : ordre croissant (convention de lecture
      // naturelle), quel que soit le type de colonne — seul le tri par défaut au premier
      // rendu (colonne "buts", décroissant) est un choix délibéré différent, pas un clic.
      setTriCle(colonne);
      setTriDirection("asc");
    }
  }

  const lignes = classementQuery.data?.results ?? [];
  const clubAfricain = lignes.find((ligne) => ligne.equipe === EQUIPE_SUIVIE);
  const joueurs = joueursQuery.data?.results ?? [];
  const rencontres = calendrierQuery.data?.results ?? [];

  // Pas de useMemo ici : quelques dizaines de lignes/joueurs/rencontres au plus (effectif
  // complet + calendrier Ligue 1 d'une saison) — le coût de recalcul à chaque rendu est
  // négligeable, la mémoisation n'apporterait rien d'autre que des dépendances à maintenir.
  const serieClubAfricain = construireSeriePointsClubAfricain(rencontres);
  const ligaMoyenne =
    lignes.length === 0
      ? 0
      : Math.round(lignes.reduce((total, ligne) => total + ligne.points, 0) / lignes.length);
  const besteEquipe = lignes.length === 0 ? 0 : Math.max(...lignes.map((ligne) => ligne.points));
  const donneesGraphique = serieClubAfricain.map((point) => ({
    ...point,
    ligaMoyenne,
    besteEquipe,
  }));
  const joueursTries = trierJoueurs(joueurs, triCle, triDirection);

  if (classementQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>;
  }
  if (classementQuery.isError || !clubAfricain) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>;
  }

  const equipeInfo = equipeInfoQuery.data;

  return (
    <div className="space-y-4">
      {equipeInfo && equipeInfo.nom && (
        <div className="flex flex-wrap items-center gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          {equipeInfo.logo_url && (
            <img
              src={equipeInfo.logo_url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-contain"
            />
          )}
          <div>
            <h2 className="text-base font-bold text-text-primary">{equipeInfo.nom}</h2>
            <p className="text-xs text-text-tertiary">
              {[equipeInfo.stade, equipeInfo.ville, equipeInfo.pays].filter(Boolean).join(" · ")}
            </p>
            {(equipeInfo.entraineur || equipeInfo.fondee_en) && (
              <p className="text-xs text-text-tertiary">
                {[
                  equipeInfo.entraineur
                    ? t("live.equipe_entraineur", { entraineur: equipeInfo.entraineur })
                    : null,
                  equipeInfo.fondee_en
                    ? t("live.equipe_fondee_en", { annee: equipeInfo.fondee_en })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCarte label={t("live.kpi_spiele")} valeur={clubAfricain.joues} />
        <KpiCarte label={t("live.kpi_siege")} valeur={clubAfricain.victoires} />
        <KpiCarte label={t("live.kpi_unentschieden")} valeur={clubAfricain.nuls} />
        <KpiCarte label={t("live.kpi_niederlagen")} valeur={clubAfricain.defaites} />
        <KpiCarte label={t("live.kpi_tore")} valeur={clubAfricain.buts_pour} />
        <KpiCarte label={t("live.kpi_gegentore")} valeur={clubAfricain.buts_contre} />
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.punkte_verlauf_titel")}
        </h2>
        {donneesGraphique.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={donneesGraphique} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
                <XAxis
                  dataKey="spieltag"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: t("live.punkte_verlauf_x"),
                    position: "insideBottom",
                    offset: -12,
                    fontSize: 10,
                  }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                {/* Légende en haut : évite toute collision avec le libellé de l'axe X
                    ("Journée", en bas) — les deux se disputaient sinon le même espace
                    vertical restreint (voir capture d'écran de validation, skill dataviz
                    étape 7). */}
                <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="clubAfricain"
                  name={t("live.statistiques_serie_club_africain")}
                  stroke={COULEUR_CLUB_AFRICAIN}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ligaMoyenne"
                  name={t("live.statistiques_serie_liga_moyenne")}
                  stroke={COULEUR_LIGA_MOYENNE}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="besteEquipe"
                  name={t("live.punkte_verlauf_serie_bestes_team")}
                  stroke={COULEUR_BESTE_EQUIPE}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {/* Repère textuel direct (pas seulement légende/tooltip) : mitige le WARN de
                contraste du mode sombre pour #CC0000 (voir docstring de tête) et rappelle
                explicitement que les deux lignes de référence sont un instantané, pas un
                historique. */}
            <p className="mt-2 text-[11px] text-text-tertiary">
              {t("live.punkte_verlauf_hinweis", { liga: ligaMoyenne, beste: besteEquipe })}
            </p>
          </>
        )}
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("live.kader_titel")}</h2>
        {joueursQuery.isLoading ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>
        ) : joueurs.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-text-tertiary">
                  <EnTeteTriable
                    colonne="nom"
                    label={t("live.statistiques_joueur")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                  />
                  <EnTeteTriable
                    colonne="poste"
                    label={t("live.statistiques_poste")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                  />
                  <EnTeteTriable
                    colonne="matchs_joues"
                    label={t("live.kader_spalte_spiele")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                    className="text-center"
                  />
                  <EnTeteTriable
                    colonne="buts"
                    label={t("live.kader_spalte_tore")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                    className="text-center"
                  />
                  <EnTeteTriable
                    colonne="passes_decisives"
                    label={t("live.kader_spalte_assists")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                    className="text-center"
                  />
                  <EnTeteTriable
                    colonne="cartons_jaunes"
                    label={t("live.statistiques_carton_jaune")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                    className="text-center"
                  />
                  <EnTeteTriable
                    colonne="cartons_rouges"
                    label={t("live.statistiques_carton_rouge")}
                    triCle={triCle}
                    triDirection={triDirection}
                    onTrier={trier}
                    className="text-center"
                  />
                </tr>
              </thead>
              <tbody>
                {joueursTries.map((joueur) => (
                  <tr key={joueur.id} className="border-t border-text-tertiary/10">
                    <td className="py-1.5 font-bold text-text-primary">{joueur.nom}</td>
                    <td className="py-1.5 text-xs text-text-tertiary">
                      {CLE_LABEL_POSTE[joueur.poste]
                        ? t(CLE_LABEL_POSTE[joueur.poste])
                        : joueur.poste}
                    </td>
                    <td className="py-1.5 text-center tabular-nums">{joueur.matchs_joues}</td>
                    <td className="py-1.5 text-center tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {joueur.buts > 0 && (
                          <IconBallFootball size={13} className="text-cad" aria-hidden="true" />
                        )}
                        {joueur.buts}
                      </span>
                    </td>
                    <td className="py-1.5 text-center tabular-nums">
                      {joueur.passes_decisives}
                    </td>
                    <td className="py-1.5 text-center tabular-nums">
                      {joueur.cartons_jaunes > 0 && (
                        <span className="mr-1 inline-block h-4 w-3 rounded-sm bg-yellow-400" />
                      )}
                      {joueur.cartons_jaunes || ""}
                    </td>
                    <td className="py-1.5 text-center tabular-nums">
                      {joueur.cartons_rouges > 0 && (
                        <span className="mr-1 inline-block h-4 w-3 rounded-sm bg-status-dangerText" />
                      )}
                      {joueur.cartons_rouges || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
