/**
 * Onglet "Statistiken"/"Statistiques" — module Fan-Club (2026-09-24, extension du Live
 * Match ; enrichi le même jour — demande utilisateur "Ich möchte mehr Statistiken
 * darstellen" — avec la comparaison à la moyenne de la ligue et la tordifférence de
 * toutes les équipes). Dérivé de `ClassementLigue` (même source synchronisée SerpApi/Google
 * Sports que l'onglet Tabelle, tableau COMPLET depuis le patch "3 requêtes SerpApi") — pas
 * d'endpoint dédié, une ligne de classement porte déjà toutes les stats d'équipe utiles.
 * Torschützen/Kartenstatistik/Kader volontairement absents ici — dépendent d'une nouvelle
 * source de données SerpApi dont la disponibilité reste à confirmer (voir conversation).
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

import { useClassementLigue } from "../../hooks/useCommunaute";

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
  const lignes = data?.results ?? [];
  const clubAfricain = lignes.find((ligne) => ligne.equipe === "Club Africain");

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>;
  }
  if (isError || !clubAfricain) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>;
  }

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
    </div>
  );
}
