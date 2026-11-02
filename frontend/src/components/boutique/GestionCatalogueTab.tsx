/**
 * Onglet „Katalog“ der Shop-Verwaltung: Artikel als Kacheln (Bild, Status, Preis, Bestand,
 * Hinweise) statt als lange Zeile voller Knöpfe. Ein Klick öffnet den Editor (KatalogEditor), der
 * die Einstellungen nach Themen ordnet; „Neues Produkt“ startet den Assistenten (ProduktAssistent).
 *
 * Die orangen/roten Hinweise kommen aus dem Überblick-Endpunkt (`hinweise` je Artikel-ID, rein
 * lesend berechnet, siehe apps.boutique.verwaltung). Der Filter „Braucht Aufmerksamkeit“ zeigt
 * nur Artikel mit solchen Hinweisen — der Überblick springt direkt dorthin (`startFilter`).
 *
 * Lesemodus: `modifiable` (optional, Standard `true`) kommt aus der Matrix „page_boutique“
 * (AdminBoutiquePage/usePageAccess) und sperrt Anlegen, Speichern, Status und Löschen im Editor.
 * Preise werden nie hier berechnet (CLAUDE.md §8): angezeigt wird `prix_final` vom Server.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProduits, useVerwaltungUeberblick } from "../../hooks/useBoutique";
import type { ArtikelHinweis, Produit, StatutProduit } from "../../types/boutique";
import BildHinweis from "../ui/BildHinweis";
import { EinfachSchalter, HilfeHinweis } from "../ui/Erklaerung";
import KatalogEditor, { euro } from "./KatalogEditor";
import ProduktAssistent from "./ProduktAssistent";

type Filter = "alle" | StatutProduit | "hinweise";

const FILTER: Filter[] = ["alle", "publie", "brouillon", "archive", "hinweise"];

const STATUT_STYLES: Record<StatutProduit, string> = {
  brouillon: "bg-bg-tertiary text-text-secondary",
  publie: "bg-status-successBg text-status-successText",
  archive: "bg-status-dangerBg text-status-dangerText",
};

const CHIP: Record<ArtikelHinweis["schwere"], string> = {
  rot: "bg-status-dangerBg text-status-dangerText",
  orange: "bg-status-warningBg text-status-warningText",
  info: "bg-bg-tertiary text-text-secondary",
};

const wichtig = (h: ArtikelHinweis) => h.schwere !== "info";

function Kachel({
  produit,
  hinweise,
  onOeffnen,
}: {
  produit: Produit;
  hinweise: ArtikelHinweis[];
  onOeffnen: () => void;
}) {
  const { t, i18n } = useTranslation("boutique");
  const bon = produit.type_produit === "bon_achat";
  const frist = produit.reservierung_frist
    ? new Date(produit.reservierung_frist).toLocaleDateString(i18n.language, {
        day: "2-digit",
        month: "2-digit",
      })
    : null;
  return (
    <li className="flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary">
      <button
        type="button"
        onClick={onOeffnen}
        aria-label={`${t("katalog.kachel.bearbeiten")} — ${produit.nom}`}
        className="flex flex-1 flex-col text-left hover:bg-bg-secondary"
      >
        {produit.image ? (
          <img src={produit.image} alt="" className="h-32 w-full object-cover" />
        ) : (
          <div className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-bg-tertiary text-text-tertiary">
            <span aria-hidden className="text-2xl">
              🛍️
            </span>
            <span className="text-[11px]">{t("katalog.kachel.ohne_bild")}</span>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-text-primary">{produit.nom}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[produit.statut]}`}
            >
              {t(`statut_produit.${produit.statut}`)}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary">
            {t(`categorie.${produit.categorie}`)}
            {produit.nouveaute ? ` · ${t("katalog.kachel.neuheit")}` : ""}
            {produit.nur_mitglieder ? ` · ${t("katalog.kachel.nur_mitglieder")}` : ""}
          </p>
          <div className="flex items-baseline gap-2">
            {produit.pourcentage_reduction ? (
              <>
                <span className="text-xs text-text-tertiary line-through">
                  {euro(produit.prix)} €
                </span>
                <span className="text-sm font-bold text-status-dangerText">
                  {euro(produit.prix_final)} €
                </span>
              </>
            ) : (
              <span className="text-sm font-bold text-ca">{euro(produit.prix)} €</span>
            )}
            {produit.prix_membre && !bon && (
              <span className="text-[11px] text-text-secondary">
                {t("catalogue_admin.prix_membre_label")}: {euro(produit.prix_membre)} €
              </span>
            )}
          </div>
          {!bon && (
            <p className="text-xs text-text-secondary">
              {produit.en_rupture
                ? t("katalog.kachel.ausverkauft")
                : t("katalog.kachel.bestand", { count: produit.stock_total })}
            </p>
          )}
          {bon && <p className="text-xs text-text-secondary">{t("katalog.kachel.gutschein")}</p>}
          {produit.reservierung_modus !== "aus" && (
            <p className="text-xs text-text-secondary">
              {frist
                ? t("katalog.kachel.reservierung_bis", { datum: frist })
                : t("katalog.kachel.reservierung")}
            </p>
          )}
          {hinweise.length > 0 && (
            <ul className="mt-auto flex flex-wrap gap-1 pt-1">
              {hinweise.map((h) => (
                <li
                  key={h.code}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CHIP[h.schwere]}`}
                >
                  {t(`katalog.hinweis.${h.code}.kurz`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </button>
    </li>
  );
}

export default function GestionCatalogueTab({
  modifiable = true,
  startFilter = "",
}: { modifiable?: boolean; startFilter?: string } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const produitsQuery = useProduits();
  const ueberblick = useVerwaltungUeberblick();
  const [filter, setFilter] = useState<Filter>(
    (FILTER as string[]).includes(startFilter) ? (startFilter as Filter) : "alle",
  );
  const [offen, setOffen] = useState<string | null>(null);
  const [assistent, setAssistent] = useState(false);

  const hinweise = ueberblick.data?.hinweise ?? {};
  const alle = produitsQuery.data?.results ?? [];
  const anzahl = (f: Filter) => alle.filter((p) => passt(p, f)).length;
  function passt(p: Produit, f: Filter): boolean {
    if (f === "alle") return true;
    if (f === "hinweise") return (hinweise[p.id] ?? []).some(wichtig);
    return p.statut === f;
  }
  const sichtbar = alle.filter((p) => passt(p, filter));
  const offenesProdukt = offen ? alle.find((p) => p.id === offen) : undefined;

  return (
    <div>
      <BildHinweis variante="shop" className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("katalog.filter_label")} className="flex flex-wrap gap-1.5">
          {FILTER.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === f
                  ? "border-ca bg-ca text-white"
                  : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
              }`}
            >
              {t(`katalog.filter.${f}`)} <span className="opacity-70">{anzahl(f)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <EinfachSchalter ns="boutique" />
          <button
            type="button"
            onClick={() => setAssistent(true)}
            disabled={!modifiable}
            title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
            className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("katalog.neu")}
          </button>
        </div>
      </div>
      <HilfeHinweis ns="boutique">{t("katalog.hilfe")}</HilfeHinweis>

      {produitsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("catalogue.chargement")}</p>
      )}
      {produitsQuery.data && alle.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("catalogue_admin.aucun_produit")}</p>
      )}
      {alle.length > 0 && sichtbar.length === 0 && (
        <p className="mt-3 text-sm text-text-tertiary">{t("katalog.ansicht_leer")}</p>
      )}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sichtbar.map((produit) => (
          <Kachel
            key={produit.id}
            produit={produit}
            hinweise={hinweise[produit.id] ?? []}
            onOeffnen={() => setOffen(produit.id)}
          />
        ))}
      </ul>

      {offenesProdukt && (
        <KatalogEditor
          key={offenesProdukt.id}
          produit={offenesProdukt}
          hinweise={hinweise[offenesProdukt.id] ?? []}
          modifiable={modifiable}
          onClose={() => setOffen(null)}
        />
      )}
      {assistent && (
        <ProduktAssistent
          onClose={() => setAssistent(false)}
          onAngelegt={(neu) => {
            setAssistent(false);
            if (neu?.id) setOffen(neu.id);
          }}
        />
      )}
    </div>
  );
}
