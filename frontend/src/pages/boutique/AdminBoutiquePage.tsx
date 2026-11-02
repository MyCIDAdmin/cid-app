/**
 * Page "Boutique — Administration" (mockup #pg-admin-boutique, FDD §2.2, Bureau Admin+).
 *
 * Überblick-Tab (2026-11-02, „Shop-Verwaltung einfacher"): Startseite mit Ampel-Kacheln und
 * Aufgaben statt der früheren vier Zähl-Kacheln. (Altes Périmètre:)
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

import UeberblickTab, { type VerwaltungsZiel } from "../../components/boutique/UeberblickTab";
import GestionBonsAchatTab from "../../components/boutique/GestionBonsAchatTab";
import GestionCatalogueTab from "../../components/boutique/GestionCatalogueTab";
import GestionCommandesTab from "../../components/boutique/GestionCommandesTab";
import GestionReservierungenTab from "../../components/boutique/GestionReservierungenTab";
import { usePageAccess } from "../../hooks/useRbac";

type Onglet = "ueberblick" | "commandes" | "catalogue" | "bons_achat" | "reservierungen";

export default function AdminBoutiquePage() {
  const { t } = useTranslation(["boutique", "common"]);
  const [onglet, setOnglet] = useState<Onglet>("ueberblick");
  // Task #216 (2026-09-24) : "page_boutique" distingue désormais lecture/lecture_ecriture — les
  // onglets ci-dessous reçoivent `modifiable` pour désactiver leurs contrôles d'écriture
  // (l'onglet Bons d'achat est déjà purement lecture seule, rien à lui passer).
  const { accessible, modifiable } = usePageAccess("page_boutique");

  // Klick auf eine Kachel oder Aufgabe: passenden Tab öffnen (Filter folgen in den Tabs).
  const gehZu = (ziel: VerwaltungsZiel) => {
    setOnglet(
      ziel.tab === "bestellungen"
        ? "commandes"
        : ziel.tab === "katalog"
          ? "catalogue"
          : "reservierungen",
    );
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("admin.titre")}</h1>

      {accessible && !modifiable && (
        <div className="mb-4 rounded-cid border border-status-warningText/30 bg-status-warningBg px-3 py-2 text-sm text-status-warningText">
          {t("common:acces.lecture_seule_banniere")}
        </div>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-text-tertiary/20">
        <button
          type="button"
          onClick={() => setOnglet("ueberblick")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "ueberblick"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("admin.onglet_ueberblick")}
        </button>
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
        <button
          type="button"
          onClick={() => setOnglet("reservierungen")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "reservierungen"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("admin.onglet_reservierungen")}
        </button>
      </div>

      {onglet === "ueberblick" && <UeberblickTab onZiel={gehZu} />}
      {onglet === "commandes" && <GestionCommandesTab modifiable={modifiable} />}
      {onglet === "catalogue" && <GestionCatalogueTab modifiable={modifiable} />}
      {onglet === "bons_achat" && <GestionBonsAchatTab />}
      {onglet === "reservierungen" && <GestionReservierungenTab modifiable={modifiable} />}
    </div>
  );
}
