/**
 * Page "Boutique — Administration" (mockup #pg-admin-boutique, FDD §2.2, Bureau Admin+).
 *
 * Périmètre réduit, même logique que AdminCampagnesPage (adhésions) : 2 onglets — Commandes
 * (traitement/annulation) et Catalogue (produits + variantes/stock) — SANS le 3e onglet
 * "Statistiques ventes" du mockup (CA boutique, top produits). Ce dernier ferait doublon avec
 * l'indicateur `revenus_boutique` déjà exposé par l'onglet Financier de Statistiques & KPIs
 * (apps.stats) ; une répartition par produit n'est modélisée nulle part côté stats (voir
 * apps.stats.services, qui documente déjà l'absence volontaire d'indicateurs sans données
 * fiables plutôt que d'agréger une seule page de commandes côté client) — laissé de côté plutôt
 * que fabriqué à partir d'un échantillon partiel.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import GestionBonsAchatTab from "../../components/boutique/GestionBonsAchatTab";
import GestionCatalogueTab from "../../components/boutique/GestionCatalogueTab";
import GestionCommandesTab from "../../components/boutique/GestionCommandesTab";
import { useCommandes, useProduits } from "../../hooks/useBoutique";

type Onglet = "commandes" | "catalogue" | "bons_achat";

export default function AdminBoutiquePage() {
  const { t } = useTranslation("boutique");
  const [onglet, setOnglet] = useState<Onglet>("commandes");

  // Requêtes légères juste pour les tuiles KPI de tête de page (mockup kg4) — les onglets
  // ci-dessous refont leur propre useCommandes/useProduits avec leurs filtres respectifs.
  const commandesEnAttente = useCommandes({ statut: "en_attente" });
  const produits = useProduits();

  const produitsActifs = produits.data?.results.filter((p) => p.statut === "publie").length ?? 0;
  const stocksEnAlerte =
    produits.data?.results.filter((p) => p.stock_faible || p.en_rupture).length ?? 0;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("admin.titre")}</h1>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("admin.kpi_en_attente")}
          </div>
          <div className="text-lg font-bold text-text-primary">
            {commandesEnAttente.data?.results.length ?? "—"}
          </div>
        </div>
        <div className="rounded-cid-lg bg-ca p-3 text-white shadow-sm">
          <div className="text-[10px] uppercase text-white/70">
            {t("admin.kpi_produits_actifs")}
          </div>
          <div className="text-lg font-bold">{produitsActifs}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("admin.kpi_total_produits")}
          </div>
          <div className="text-lg font-bold text-text-primary">
            {produits.data?.results.length ?? "—"}
          </div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-status-warningText">
            {t("admin.kpi_stocks_alerte")}
          </div>
          <div className="text-lg font-bold text-status-warningText">{stocksEnAlerte}</div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        <button
          type="button"
          onClick={() => setOnglet("commandes")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "commandes"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("admin.onglet_commandes")}
        </button>
        <button
          type="button"
          onClick={() => setOnglet("catalogue")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "catalogue"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("admin.onglet_catalogue")}
        </button>
        <button
          type="button"
          onClick={() => setOnglet("bons_achat")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "bons_achat"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("admin.onglet_bons_achat")}
        </button>
      </div>

      {onglet === "commandes" && <GestionCommandesTab />}
      {onglet === "catalogue" && <GestionCatalogueTab />}
      {onglet === "bons_achat" && <GestionBonsAchatTab />}
    </div>
  );
}
