/**
 * Assistent „Neues Produkt“: drei kurze Schritte (Art, Preis und Bestand, Prüfen) statt eines
 * langen Formulars. Der letzte Schritt zeigt eine Checkliste mit Pflicht- und empfohlenen
 * Angaben; „Veröffentlichen“ ist erst möglich, wenn alle Pflichtangaben stehen. „Als Entwurf
 * speichern“ geht immer (mit Namen), der Entwurf ist nur für die Verwaltung sichtbar.
 *
 * Das Bild gibt es erst nach dem Anlegen (Upload braucht die Produkt-ID): nach dem Speichern
 * öffnet der Editor, damit man es direkt hochladen kann. Bei Gutscheinen (`bon_achat`) gelten
 * wie bisher Kategorie „bon_achat“ und kein Bestand/Rabatt (Backend bleibt maßgeblich).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreerProduit } from "../../hooks/useBoutique";
import { hintergrundKlick } from "../../hooks/useEscapeSchliessen";
import type {
  CategorieProduit,
  Produit,
  ProduitPayload,
  StatutProduit,
  TypeProduit,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { EscapeSchliessen } from "../ui/EscapeSchliessen";
import { Fachwort, HilfeHinweis } from "../ui/Erklaerung";
import { CATEGORIES } from "./katalogHilfen";

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";

function startFormular(): ProduitPayload {
  return {
    nom: "",
    categorie: "vetements",
    description: "",
    prix: "0.00",
    pourcentage_reduction: null,
    prix_membre: null,
    statut: "brouillon",
    type_produit: "physique",
    nouveaute: false,
    nur_mitglieder: false,
    seuil_alerte_stock: 5,
    stock_initial: 0,
  };
}

export default function ProduktAssistent({
  onClose,
  onAngelegt,
}: {
  onClose: () => void;
  /** Wird nach erfolgreichem Anlegen mit dem neuen Artikel aufgerufen (öffnet den Editor). */
  onAngelegt: (produit: Produit | undefined) => void;
}) {
  const { t } = useTranslation("boutique");
  const anlegen = useCreerProduit();
  const [schritt, setSchritt] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ProduitPayload>(startFormular);
  const bon = form.type_produit === "bon_achat";

  function artWaehlen(art: TypeProduit) {
    setForm((f) => ({
      ...f,
      type_produit: art,
      categorie:
        art === "bon_achat" ? "bon_achat" : f.categorie === "bon_achat" ? "vetements" : f.categorie,
    }));
  }

  const name = form.nom.trim() !== "";
  const preis = bon || Number(form.prix) > 0;
  const pflichtOk = name && preis;
  const checks: { schluessel: string; ok: boolean; pflicht: boolean }[] = [
    { schluessel: "name", ok: name, pflicht: true },
    ...(bon ? [] : [{ schluessel: "preis", ok: preis, pflicht: true }]),
    { schluessel: "beschreibung", ok: (form.description ?? "").trim() !== "", pflicht: false },
    ...(bon ? [] : [{ schluessel: "bestand", ok: (form.stock_initial ?? 0) > 0, pflicht: false }]),
  ];

  function speichern(statut: StatutProduit) {
    // stock_initial ergibt für Gutscheine keinen Sinn und wird nie gesendet (siehe Backend-Garde
    // in ProduitSerializer.create — wir verlassen uns trotzdem nicht allein darauf).
    const payload: ProduitPayload = {
      ...form,
      nom: form.nom.trim(),
      statut,
      ...(bon ? { stock_initial: undefined } : {}),
    };
    anlegen.mutate(payload, { onSuccess: (produit) => onAngelegt(produit) });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("katalog.assistent.titel")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      {...hintergrundKlick(onClose)}
    >
      <EscapeSchliessen onClose={onClose} />
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <h2 className="text-base font-semibold text-text-primary">
          {t("katalog.assistent.titel")}
        </h2>
        <p className="mt-1 text-xs text-text-tertiary">
          {t("katalog.assistent.schritt_von", { nr: schritt })} ·{" "}
          {t(`katalog.assistent.schritt.${["art", "preis", "fertig"][schritt - 1]}`)}
        </p>

        {schritt === 1 && (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {(["physique", "bon_achat"] as TypeProduit[]).map((art) => {
                const aktiv = (form.type_produit ?? "physique") === art;
                const schluessel = art === "physique" ? "art_physisch" : "art_gutschein";
                return (
                  <button
                    key={art}
                    type="button"
                    role="radio"
                    aria-checked={aktiv}
                    onClick={() => artWaehlen(art)}
                    className={`rounded-cid border p-3 text-left ${
                      aktiv ? "border-ca bg-bg-secondary" : "border-text-tertiary/30"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-text-primary">
                      {t(`katalog.assistent.${schluessel}`)}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      {t(`katalog.assistent.${schluessel}_text`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div>
              <label htmlFor="as-nom" className="mb-1 block text-xs text-text-secondary">
                {t("catalogue_admin.nom_label")}
              </label>
              <input
                id="as-nom"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className={FELD}
              />
            </div>
            {!bon && (
              <div>
                <label htmlFor="as-categorie" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.categorie_label")}
                </label>
                <select
                  id="as-categorie"
                  value={form.categorie}
                  onChange={(e) =>
                    setForm({ ...form, categorie: e.target.value as CategorieProduit })
                  }
                  className={FELD}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categorie.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="as-desc" className="mb-1 block text-xs text-text-secondary">
                {t("catalogue_admin.description_label")}
              </label>
              <textarea
                id="as-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={FELD}
              />
            </div>
            <HilfeHinweis ns="boutique">
              <Fachwort ns="boutique" begriff="gutschein" />
            </HilfeHinweis>
          </div>
        )}

        {schritt === 2 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="as-prix" className="mb-1 block text-xs text-text-secondary">
                {t("catalogue_admin.prix_label")}
              </label>
              <input
                id="as-prix"
                type="number"
                min="0"
                step="0.01"
                value={form.prix}
                onChange={(e) => setForm({ ...form, prix: e.target.value })}
                className={FELD}
              />
            </div>
            {bon ? (
              <p className="self-end text-xs text-text-secondary">
                {t("katalog.assistent.gutschein_preis_hinweis")}
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="as-stock" className="mb-1 block text-xs text-text-secondary">
                    {t("catalogue_admin.stock_initial_label")}
                  </label>
                  <input
                    id="as-stock"
                    type="number"
                    min="0"
                    value={form.stock_initial ?? 0}
                    onChange={(e) => setForm({ ...form, stock_initial: Number(e.target.value) })}
                    className={FELD}
                  />
                </div>
                <div>
                  <label
                    htmlFor="as-prix-membre"
                    className="mb-1 block text-xs text-text-secondary"
                  >
                    {t("catalogue_admin.prix_membre_label")}
                  </label>
                  <input
                    id="as-prix-membre"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("catalogue_admin.prix_membre_placeholder")}
                    value={form.prix_membre ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        prix_membre: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    className={FELD}
                  />
                </div>
                <div>
                  <label htmlFor="as-rabais" className="mb-1 block text-xs text-text-secondary">
                    {t("catalogue_admin.rabais_label")}
                  </label>
                  <input
                    id="as-rabais"
                    type="number"
                    min="1"
                    max="90"
                    placeholder={t("catalogue_admin.rabais_placeholder")}
                    value={form.pourcentage_reduction ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pourcentage_reduction:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className={FELD}
                  />
                </div>
                <div>
                  <label htmlFor="as-seuil" className="mb-1 block text-xs text-text-secondary">
                    {t("catalogue_admin.seuil_label")}
                  </label>
                  <input
                    id="as-seuil"
                    type="number"
                    min="0"
                    value={form.seuil_alerte_stock}
                    onChange={(e) =>
                      setForm({ ...form, seuil_alerte_stock: Number(e.target.value) })
                    }
                    className={FELD}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.nur_mitglieder ?? false}
                    onChange={(e) => setForm({ ...form, nur_mitglieder: e.target.checked })}
                  />
                  {t("catalogue_admin.nur_mitglieder_label")}
                </label>
                <HilfeHinweis ns="boutique">
                  <Fachwort ns="boutique" begriff="bestand" />
                  {" · "}
                  <Fachwort ns="boutique" begriff="mitgliederpreis" />
                  {" · "}
                  <Fachwort ns="boutique" begriff="warnschwelle" />
                </HilfeHinweis>
              </>
            )}
          </div>
        )}

        {schritt === 3 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-text-primary">
              {t("katalog.assistent.checkliste")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c) => (
                <li key={c.schluessel} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className={c.ok ? "text-status-successText" : "text-status-warningText"}
                  >
                    {c.ok ? "✓" : "○"}
                  </span>
                  <span className="flex-1 text-text-primary">
                    {t(`katalog.assistent.check.${c.schluessel}`)}
                  </span>
                  <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] text-text-secondary">
                    {c.pflicht ? t("katalog.assistent.pflicht") : t("katalog.assistent.empfohlen")}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-status-warningText">
                  ○
                </span>
                <span className="flex-1 text-text-primary">
                  {t("katalog.assistent.check.bild")}
                </span>
                <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] text-text-secondary">
                  {t("katalog.assistent.empfohlen")}
                </span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-text-tertiary">{t("katalog.assistent.bild_spaeter")}</p>
            <p
              role="note"
              className="mt-3 rounded-cid bg-status-infoBg px-3 py-2 text-xs text-status-infoText"
            >
              {t("katalog.assistent.entwurf_text")}
            </p>
            {!pflichtOk && (
              <p className="mt-2 text-xs text-status-warningText">
                {t("katalog.assistent.veroeffentlichen_gesperrt")}
              </p>
            )}
            {anlegen.isError && (
              <p className="mt-2 text-xs text-status-dangerText">
                {extractApiErrorMessage(anlegen.error, t("catalogue_admin.erreur_creation"))}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={schritt === 1 ? onClose : () => setSchritt((s) => (s - 1) as 1 | 2 | 3)}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {schritt === 1 ? t("katalog.assistent.abbrechen") : t("katalog.assistent.zurueck")}
          </button>
          {schritt < 3 ? (
            <button
              type="button"
              disabled={schritt === 1 && !name}
              onClick={() => setSchritt((s) => (s + 1) as 1 | 2 | 3)}
              className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("katalog.assistent.weiter")}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!name || anlegen.isPending}
                onClick={() => speichern("brouillon")}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
              >
                {t("katalog.assistent.entwurf")}
              </button>
              <button
                type="button"
                disabled={!pflichtOk || anlegen.isPending}
                onClick={() => speichern("publie")}
                className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
              >
                {t("katalog.assistent.veroeffentlichen")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
