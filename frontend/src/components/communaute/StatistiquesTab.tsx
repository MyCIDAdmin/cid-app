/**
 * Onglet "Statistiken"/"Statistiques" — module Fan-Club (2026-09-24, extension du Live
 * Match ; enrichi le même jour — demande utilisateur "Ich möchte mehr Statistiken
 * darstellen" — avec la comparaison à la moyenne de la ligue et la tordifférence de
 * toutes les équipes). Forme/comparaison/tordifférence dérivés de `ClassementLigue` (même
 * source synchronisée que l'onglet Tabelle) — une ligne de classement porte déjà toutes
 * les stats d'équipe utiles, pas d'endpoint dédié.
 *
 * Torschützen (buteurs)/Kartenstatistik (cartons) ajoutés lors de la bascule SerpApi →
 * GOAL API (2026-09-24, voir services.py) : indisponibles sous SerpApi/Google Sports faute
 * de données joueur pour la Ligue 1 tunisienne, désormais dérivés de `StatistiqueJoueur`
 * (effectif de Club Africain synchronisé depuis GOAL API).
 */
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useClassementLigue, useStatistiquesJoueurs } from "../../hooks/useCommunaute";
import type { StatistiqueJoueur } from "../../types/communaute";

// Poste GOAL API (`StatistiqueJoueur.poste`, ex. "Goalkeepers") → clé i18n. Valeur brute
// affichée telle quelle si absente de cette table (nouveau poste GOAL API non prévu).
const CLE_LABEL_POSTE: Record<string, string> = {
  Goalkeepers: "live.statistiques_poste_gardien",
  Defenders: "live.statistiques_poste_defenseur",
  Midfielders: "live.statistiques_poste_milieu",
  Forwards: "live.statistiques_poste_attaquant",
};

const NOMBRE_TORSCHUETZEN = 10;
const NOMBRE_CARTONS = 10;

function meilleursButeurs(joueurs: StatistiqueJoueur[]): StatistiqueJoueur[] {
  return [...joueurs]
    .filter((joueur) => joueur.buts > 0)
    .sort((a, b) => b.buts - a.buts || a.nom.localeCompare(b.nom))
    .slice(0, NOMBRE_TORSCHUETZEN);
}

function joueursLesPlusSanctionnes(joueurs: StatistiqueJoueur[]): StatistiqueJoueur[] {
  return [...joueurs]
    .filter((joueur) => joueur.cartons_jaunes > 0 || joueur.cartons_rouges > 0)
    .sort(
      (a, b) =>
        b.cartons_rouges - a.cartons_rouges ||
        b.cartons_jaunes - a.cartons_jaunes ||
        a.nom.localeCompare(b.nom),
    )
    .slice(0, NOMBRE_CARTONS);
}

const COULEUR_FORME: Record<string, string> = {
  V: "bg-status-successBg text-status-successText",
  N: "bg-bg-secondary text-text-tertiary",
  D: "bg-status-dangerBg text-status-dangerText",
};

// Tordifférence : UNE équipe mise en avant (Club Africain, rouge de marque) au sein d'un
// classement complet, le reste en gris neutre — pas une identité catégorielle à N séries,
// donc pas soumis au plancher de chroma du dataviz skill (validé séparément ci-dessous).
const COULEUR_ACCENT = "#CC0000";
const COULEUR_NEUTRE = "#6B7280";
// Club Africain vs. moyenne de la ligue : ici deux VRAIES séries identitaires (pas un
// accent + un neutre) — paire validée avec le validateur du dataviz skill
// (`node scripts/validate_palette.js "#CC0000,#2a78d6" --mode light`) : bande de clarté,
// plancher de chroma, séparation CVD (ΔE 27.9) et plancher vision normale (ΔE 35.3) tous
// au vert, contraste >= 3:1 sur la surface claire.
const COULEUR_LIGA_MOYENNE = "#2a78d6";

function moyenne(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  return Math.round((valeurs.reduce((total, v) => total + v, 0) / valeurs.length) * 10) / 10;
}

export default function StatistiquesTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useClassementLigue();
  const joueursQuery = useStatistiquesJoueurs();
  const lignes = data?.results ?? [];
  const clubAfricain = lignes.find((ligne) => ligne.equipe === "Club Africain");

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>;
  }
  if (isError || !clubAfricain) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>;
  }

  const joueurs = joueursQuery.data?.results ?? [];
  const buteurs = meilleursButeurs(joueurs);
  const sanctionnes = joueursLesPlusSanctionnes(joueurs);

  const forme = clubAfricain.forme_recente.split("").filter(Boolean);

  const donneesVergleich = [
    {
      categorie: t("live.classement_buts_pour"),
      clubAfricain: clubAfricain.buts_pour,
      ligaMoyenne: moyenne(lignes.map((ligne) => ligne.buts_pour)),
    },
    {
      categorie: t("live.classement_buts_contre"),
      clubAfricain: clubAfricain.buts_contre,
      ligaMoyenne: moyenne(lignes.map((ligne) => ligne.buts_contre)),
    },
  ];

  const donneesTordifferenz = [...lignes]
    .sort((a, b) => b.difference - a.difference)
    .map((ligne) => ({ equipe: ligne.equipe, difference: ligne.difference }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_forme_titre")}
        </h2>
        {forme.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <div className="flex gap-1.5">
            {forme.map((lettre, index) => (
              <span
                key={`${lettre}-${index}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  COULEUR_FORME[lettre] ?? "bg-bg-secondary text-text-tertiary"
                }`}
              >
                {lettre}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_buts_titre")}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={donneesVergleich}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
            <XAxis dataKey="categorie" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="clubAfricain"
              name={t("live.statistiques_serie_club_africain")}
              fill={COULEUR_ACCENT}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="ligaMoyenne"
              name={t("live.statistiques_serie_liga_moyenne")}
              fill={COULEUR_LIGA_MOYENNE}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm md:col-span-2">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_tordifferenz_titre")}
        </h2>
        <ResponsiveContainer width="100%" height={Math.max(200, donneesTordifferenz.length * 26)}>
          <BarChart data={donneesTordifferenz} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="equipe" tick={{ fontSize: 10 }} width={110} />
            <Tooltip />
            <Bar dataKey="difference" radius={[0, 4, 4, 0]}>
              {donneesTordifferenz.map((ligne) => (
                <Cell
                  key={ligne.equipe}
                  fill={ligne.equipe === "Club Africain" ? COULEUR_ACCENT : COULEUR_NEUTRE}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_torschuetzen_titre")}
        </h2>
        {joueursQuery.isLoading ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>
        ) : buteurs.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <ol className="space-y-1.5">
            {buteurs.map((joueurButeur, index) => (
              <li key={joueurButeur.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-text-tertiary">
                  {index + 1}
                </span>
                <span className="flex-1 truncate font-bold text-text-primary">
                  {joueurButeur.nom}
                </span>
                <span className="shrink-0 tabular-nums font-bold text-cad">
                  {joueurButeur.buts}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_karten_titre")}
        </h2>
        {joueursQuery.isLoading ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>
        ) : sanctionnes.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text-tertiary">
                <th className="py-1.5">{t("live.statistiques_joueur")}</th>
                <th className="py-1.5">{t("live.statistiques_poste")}</th>
                <th className="py-1.5 text-center">{t("live.statistiques_carton_jaune")}</th>
                <th className="py-1.5 text-center">{t("live.statistiques_carton_rouge")}</th>
              </tr>
            </thead>
            <tbody>
              {sanctionnes.map((joueur) => (
                <tr key={joueur.id} className="border-t border-text-tertiary/10">
                  <td className="py-1.5 font-bold text-text-primary">{joueur.nom}</td>
                  <td className="py-1.5 text-xs text-text-tertiary">
                    {CLE_LABEL_POSTE[joueur.poste] ? t(CLE_LABEL_POSTE[joueur.poste]) : joueur.poste}
                  </td>
                  <td className="py-1.5 text-center tabular-nums">
                    {joueur.cartons_jaunes > 0 && (
                      <span className="inline-block h-4 w-3 rounded-sm bg-yellow-400" />
                    )}
                    <span className="ml-1">{joueur.cartons_jaunes || ""}</span>
                  </td>
                  <td className="py-1.5 text-center tabular-nums">
                    {joueur.cartons_rouges > 0 && (
                      <span className="inline-block h-4 w-3 rounded-sm bg-status-dangerText" />
                    )}
                    <span className="ml-1">{joueur.cartons_rouges || ""}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
