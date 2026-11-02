/**
 * Editor eines Artikels der Shop-Verwaltung: ein Seitenfenster, das die Einstellungen nach
 * Themen ordnet (Grunddaten, Preis, Bestand, Reservierung, Fotos, Sichtbarkeit, Löschen) statt
 * als lange Zeile voller Knöpfe. Die bestehenden Verwalter (Varianten, Mengenrabatte,
 * Reservierung, Galerie, Übersetzungen) bleiben unverändert und sitzen in ihren Themen.
 *
 * Gespeichert werden Grunddaten, Preis und Warnschwelle gemeinsam mit „Änderungen speichern“;
 * Sichtbarkeit (Status) wirkt sofort, weil sie die wichtigste Entscheidung ist. Schreibende
 * Aktionen sind bei `modifiable=false` gesperrt (Backend bleibt maßgeblich).
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useModifierProduit,
  useSupprimerProduit,
  useTeleverserImageProduit,
} from "../../hooks/useBoutique";
import type {
  ArtikelHinweis,
  CategorieProduit,
  Produit,
  ProduitPayload,
  StatutProduit,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { hintergrundKlick } from "../../hooks/useEscapeSchliessen";
import { EscapeSchliessen } from "../ui/EscapeSchliessen";
import { Fachwort, HilfeHinweis } from "../ui/Erklaerung";
import UebersetzungenButton from "../ui/UebersetzungenButton";
import GalerieProduitManager from "./GalerieProduitManager";
import RegleReductionManager from "./RegleReductionManager";
import ReservierungsEinstellungen from "./ReservierungsEinstellungen";
import VariantesManager from "./VariantesManager";
import { CATEGORIES, euro, useHinweisText } from "./katalogHilfen";

const STATUTS: StatutProduit[] = ["brouillon", "publie", "archive"];
const FELD =
  "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-40";
const KNOPF =
  "rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-40";

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-text-tertiary/15 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
        {titel}
      </h3>
      {children}
    </section>
  );
}

export default function KatalogEditor({
  produit,
  hinweise,
  modifiable,
  onClose,
}: {
  produit: Produit;
  hinweise: ArtikelHinweis[];
  modifiable: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["boutique", "common"]);
  const hinweisText = useHinweisText();
  const modifier = useModifierProduit();
  const supprimer = useSupprimerProduit();
  const bildHochladen = useTeleverserImageProduit();
  const dateiRef = useRef<HTMLInputElement | null>(null);
  const bon = produit.type_produit === "bon_achat";
  const sperre = !modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : "";

  const [nom, setNom] = useState(produit.nom);
  const [categorie, setCategorie] = useState<CategorieProduit>(produit.categorie);
  const [beschreibung, setBeschreibung] = useState(produit.description);
  const [neuheit, setNeuheit] = useState(produit.nouveaute);
  const [nurMitglieder, setNurMitglieder] = useState(produit.nur_mitglieder ?? false);
  const [prix, setPrix] = useState(produit.prix);
  const [rabatt, setRabatt] = useState(String(produit.pourcentage_reduction ?? ""));
  const [prixMembre, setPrixMembre] = useState(produit.prix_membre ?? "");
  const [schwelle, setSchwelle] = useState(String(produit.seuil_alerte_stock));
  const [gespeichert, setGespeichert] = useState(false);
  const [bildFehler, setBildFehler] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [loeschenFehler, setLoeschenFehler] = useState<string | null>(null);

  function speichern() {
    if (!modifiable) return;
    setGespeichert(false);
    const payload: Partial<ProduitPayload> = {
      nom,
      categorie,
      description: beschreibung,
      nouveaute: neuheit,
      nur_mitglieder: nurMitglieder,
      prix,
    };
    if (!bon) {
      payload.pourcentage_reduction = rabatt === "" ? null : Number(rabatt);
      payload.prix_membre = prixMembre === "" ? null : prixMembre;
      payload.seuil_alerte_stock = Number(schwelle);
    }
    modifier.mutate({ id: produit.id, payload }, { onSuccess: () => setGespeichert(true) });
  }

  function statusSetzen(statut: StatutProduit) {
    if (!modifiable) return;
    modifier.mutate({ id: produit.id, payload: { statut } });
  }

  function bildGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !modifiable) return;
    setBildFehler(null);
    bildHochladen.mutate(
      { id: produit.id, fichier },
      {
        onError: (err) =>
          setBildFehler(extractApiErrorMessage(err, t("catalogue_admin.image_erreur"))),
      },
    );
  }

  function loeschen() {
    supprimer.mutate(produit.id, {
      onSuccess: onClose,
      onError: (err) => {
        setLoeschenFrage(false);
        setLoeschenFehler(extractApiErrorMessage(err, t("catalogue_admin.supprimer_erreur")));
      },
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("katalog.editor.titel")}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      {...hintergrundKlick(onClose)}
    >
      <EscapeSchliessen onClose={onClose} />
      <div className="flex h-full w-full max-w-xl flex-col bg-bg-primary shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-text-tertiary/15 p-4">
          <div className="min-w-0">
            <p className="text-xs text-text-tertiary">{t("katalog.editor.titel")}</p>
            <h2 className="truncate text-base font-semibold text-text-primary">{produit.nom}</h2>
          </div>
          <button type="button" onClick={onClose} className={KNOPF}>
            {t("katalog.editor.schliessen")}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {!modifiable && (
            <p className="mb-3 rounded-cid bg-status-warningBg px-3 py-2 text-xs text-status-warningText">
              {t("katalog.editor.nur_lesen")}
            </p>
          )}
          {hinweise.length > 0 && (
            <div className="mb-4 rounded-cid bg-status-warningBg px-3 py-2 text-xs text-status-warningText">
              <p className="mb-1 font-semibold">{t("katalog.editor.hinweise_titel")}</p>
              <ul className="list-disc pl-4">
                {hinweise.map((h) => (
                  <li key={h.code}>{hinweisText(h)}</li>
                ))}
              </ul>
            </div>
          )}

          <Abschnitt titel={t("katalog.editor.abschnitt.grunddaten")}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="ed-nom" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.nom_label")}
                </label>
                <input
                  id="ed-nom"
                  value={nom}
                  disabled={!modifiable}
                  onChange={(e) => setNom(e.target.value)}
                  className={FELD}
                />
              </div>
              <div>
                <label htmlFor="ed-categorie" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.categorie_label")}
                </label>
                {bon ? (
                  <input
                    id="ed-categorie"
                    disabled
                    value={t("categorie.bon_achat")}
                    className={`${FELD} bg-bg-tertiary`}
                  />
                ) : (
                  <select
                    id="ed-categorie"
                    value={categorie}
                    disabled={!modifiable}
                    onChange={(e) => setCategorie(e.target.value as CategorieProduit)}
                    className={FELD}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`categorie.${c}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={neuheit}
                    disabled={!modifiable}
                    onChange={(e) => setNeuheit(e.target.checked)}
                  />
                  {t("catalogue_admin.nouveaute_label")}
                </label>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={nurMitglieder}
                    disabled={!modifiable}
                    onChange={(e) => setNurMitglieder(e.target.checked)}
                  />
                  {t("catalogue_admin.nur_mitglieder_label")}
                </label>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ed-desc" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.description_label")}
                </label>
                <textarea
                  id="ed-desc"
                  rows={3}
                  value={beschreibung}
                  disabled={!modifiable}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  className={FELD}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={dateiRef}
                  onChange={bildGewaehlt}
                  className="hidden"
                  aria-label={t("catalogue_admin.image_televerser")}
                />
                <button
                  type="button"
                  onClick={() => dateiRef.current?.click()}
                  disabled={!modifiable || bildHochladen.isPending}
                  title={sperre}
                  className={KNOPF}
                >
                  {bildHochladen.isPending
                    ? t("catalogue_admin.image_en_cours")
                    : t("catalogue_admin.image_televerser")}
                </button>
                {modifiable && (
                  <UebersetzungenButton
                    modell="boutique.produit"
                    objektId={produit.id}
                    className={KNOPF}
                  />
                )}
                {bildFehler && <span className="text-xs text-status-dangerText">{bildFehler}</span>}
              </div>
            </div>
          </Abschnitt>

          <Abschnitt titel={t("katalog.editor.abschnitt.preis")}>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="ed-prix" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.prix_label")}
                </label>
                <input
                  id="ed-prix"
                  type="number"
                  min="0"
                  step="0.01"
                  value={prix}
                  disabled={!modifiable}
                  onChange={(e) => setPrix(e.target.value)}
                  className={FELD}
                />
              </div>
              {!bon && (
                <>
                  <div>
                    <label htmlFor="ed-rabais" className="mb-1 block text-xs text-text-secondary">
                      {t("catalogue_admin.rabais_label")}
                    </label>
                    <input
                      id="ed-rabais"
                      type="number"
                      min="1"
                      max="90"
                      placeholder={t("catalogue_admin.rabais_placeholder")}
                      value={rabatt}
                      disabled={!modifiable}
                      onChange={(e) => setRabatt(e.target.value)}
                      className={FELD}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-prix-membre"
                      className="mb-1 block text-xs text-text-secondary"
                    >
                      {t("catalogue_admin.prix_membre_label")}
                    </label>
                    <input
                      id="ed-prix-membre"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t("catalogue_admin.prix_membre_placeholder")}
                      value={prixMembre}
                      disabled={!modifiable}
                      onChange={(e) => setPrixMembre(e.target.value)}
                      className={FELD}
                    />
                  </div>
                </>
              )}
            </div>
            {!bon && produit.pourcentage_reduction ? (
              <p className="mt-2 text-xs text-text-secondary">
                <span className="mr-1 line-through">{euro(produit.prix)} €</span>
                <span className="font-bold text-status-dangerText">
                  {euro(produit.prix_final)} €
                </span>
              </p>
            ) : null}
            <HilfeHinweis ns="boutique">
              <Fachwort ns="boutique" begriff="mitgliederpreis" />
            </HilfeHinweis>
            {!bon && (
              <div className="mt-3">
                <RegleReductionManager produit={produit} modifiable={modifiable} />
              </div>
            )}
          </Abschnitt>

          {!bon && (
            <Abschnitt titel={t("katalog.editor.abschnitt.bestand")}>
              <div className="mb-2 max-w-[12rem]">
                <label htmlFor="ed-seuil" className="mb-1 block text-xs text-text-secondary">
                  {t("catalogue_admin.seuil_label")}
                </label>
                <input
                  id="ed-seuil"
                  type="number"
                  min="0"
                  value={schwelle}
                  disabled={!modifiable}
                  onChange={(e) => setSchwelle(e.target.value)}
                  className={FELD}
                />
              </div>
              <HilfeHinweis ns="boutique">
                <Fachwort ns="boutique" begriff="bestand" />
                {" · "}
                <Fachwort ns="boutique" begriff="variante" />
                {" · "}
                <Fachwort ns="boutique" begriff="warnschwelle" />
              </HilfeHinweis>
              <VariantesManager produit={produit} modifiable={modifiable} />
            </Abschnitt>
          )}

          {!bon && (
            <Abschnitt titel={t("katalog.editor.abschnitt.reservierung")}>
              <ReservierungsEinstellungen produit={produit} modifiable={modifiable} />
            </Abschnitt>
          )}

          <Abschnitt titel={t("katalog.editor.abschnitt.fotos")}>
            <GalerieProduitManager produit={produit} modifiable={modifiable} />
          </Abschnitt>

          <Abschnitt titel={t("katalog.editor.abschnitt.sichtbarkeit")}>
            <label className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {t("catalogue_admin.changer_statut")}
              <select
                aria-label={t("catalogue_admin.changer_statut")}
                value={produit.statut}
                disabled={!modifiable}
                title={sperre}
                onChange={(e) => statusSetzen(e.target.value as StatutProduit)}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-40"
              >
                {STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`statut_produit.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-text-secondary">
              {t(`katalog.editor.status_text.${produit.statut}`)}
            </p>
            <HilfeHinweis ns="boutique">
              <Fachwort ns="boutique" begriff="entwurf" />
              {" · "}
              <Fachwort ns="boutique" begriff="veroeffentlicht" />
              {" · "}
              <Fachwort ns="boutique" begriff="archiviert" />
            </HilfeHinweis>
          </Abschnitt>

          {modifiable && (
            <Abschnitt titel={t("katalog.editor.abschnitt.loeschen")}>
              <p className="mb-2 text-xs text-text-tertiary">
                {t("katalog.editor.loeschen_hilfe")}
              </p>
              {loeschenFrage ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-status-dangerText">
                    {t("catalogue_admin.supprimer_confirmer")}
                  </span>
                  <button
                    type="button"
                    disabled={supprimer.isPending}
                    onClick={loeschen}
                    className="rounded-cid bg-status-dangerText px-2 py-1 text-white disabled:opacity-50"
                  >
                    {t("catalogue_admin.supprimer_oui")}
                  </button>
                  <button type="button" onClick={() => setLoeschenFrage(false)} className={KNOPF}>
                    {t("catalogue_admin.supprimer_non")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoeschenFrage(true)}
                  className="rounded-cid border border-status-dangerText/40 px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                >
                  {t("catalogue_admin.supprimer_produit")}
                </button>
              )}
              {loeschenFehler && (
                <p className="mt-1 text-[11px] text-status-dangerText">{loeschenFehler}</p>
              )}
            </Abschnitt>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-text-tertiary/15 p-4">
          <button
            type="button"
            onClick={speichern}
            disabled={!modifiable || modifier.isPending || nom.trim() === ""}
            title={sperre}
            className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("katalog.editor.speichern")}
          </button>
          {gespeichert && (
            <span className="text-xs text-status-successText">
              {t("katalog.editor.gespeichert")}
            </span>
          )}
          {modifier.isError && (
            <span className="text-xs text-status-dangerText">
              {extractApiErrorMessage(modifier.error, t("katalog.editor.fehler"))}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
