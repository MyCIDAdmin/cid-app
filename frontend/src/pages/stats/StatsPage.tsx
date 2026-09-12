/**
 * Page "Statistiques & KPIs" (mockup #pg-stats, FDD §5.3, Admin/DG/Bureau Admin — voir
 * StatsPermission côté backend). 3 onglets R1 : Financier, Membres, Événements — Engagement et
 * Projets restent R2 (CID-RPL-001 §2.2), pas d'onglet créé pour eux ici.
 *
 * Filtres communs (année/ville/statut) partagés par les 3 onglets, comme côté API
 * (apps.stats.services) — l'onglet Membres ignore volontairement `annee` (kpis_membres n'en
 * prend pas, c'est une photo de l'état actuel, pas une série temporelle).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import OngletEvenements from "../../components/stats/OngletEvenements";
import OngletFinancier from "../../components/stats/OngletFinancier";
import OngletMembres from "../../components/stats/OngletMembres";
import type { StatsFiltres } from "../../types/stats";

type Onglet = "financier" | "membres" | "evenements";

const ANNEE_COURANTE = new Date().getFullYear();

export default function StatsPage() {
  const { t } = useTranslation("stats");
  const [onglet, setOnglet] = useState<Onglet>("financier");
  const [annee, setAnnee] = useState(ANNEE_COURANTE);
  const [ville, setVille] = useState("");
  const [statut, setStatut] = useState("");

  const filtres: StatsFiltres = {
    annee,
    ville: ville || undefined,
    statut: statut || undefined,
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("page.titre")}</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="stats-annee"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.annee")}
          </label>
          <input
            id="stats-annee"
            type="number"
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="stats-ville"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.ville")}
          </label>
          <input
            id="stats-ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder={t("filtres.ville_placeholder")}
            className="w-32 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="stats-statut"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.statut")}
          </label>
          <select
            id="stats-statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("filtres.statut_tous")}</option>
            <option value="actif">{t("filtres.statut_actif")}</option>
            <option value="en_attente">{t("filtres.statut_en_attente")}</option>
            <option value="inactif">{t("filtres.statut_inactif")}</option>
          </select>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        {(["financier", "membres", "evenements"] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-2 text-sm font-medium ${
              onglet === o
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`onglets.${o}`)}
          </button>
        ))}
      </div>

      {onglet === "financier" && <OngletFinancier filtres={filtres} />}
      {onglet === "membres" && <OngletMembres filtres={filtres} />}
      {onglet === "evenements" && <OngletEvenements filtres={filtres} />}
    </div>
  );
}
