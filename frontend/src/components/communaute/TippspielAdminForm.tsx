/**
 * Formulaire de création/édition d'un Tippspiel — réservé à l'Administrateur App
 * (`super_admin`, "Nur der App Admin kann das Spiel einstellen", retour utilisateur),
 * voir TippspielPermission côté backend (contrôle réel côté serveur ; ce composant n'est
 * de toute façon rendu par TippspielSection que pour ce rôle). Permet de définir un
 * teilnahmebeitrag optionnel et une liste de lots par rang ("Beim Erstellen des Spiels
 * kann es möglich sein, Teilnahmebeiträge zu definieren und Gewinnpreise zu definieren",
 * retour utilisateur) — trois formes de lot (article Boutique / montant fixe /
 * pourcentage de la cagnotte), voir TypePrixTippspiel.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreerTippspiel, useModifierTippspiel } from "../../hooks/useCommunaute";
import { useProduits } from "../../hooks/useBoutique";
import type { Tippspiel, TippspielPrixPayload, TypePrixTippspiel } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

function prixInitiaux(tippspiel?: Tippspiel): TippspielPrixPayload[] {
  if (!tippspiel) return [];
  return tippspiel.prix.map((p) => ({
    platz: p.platz,
    type_prix: p.type_prix,
    produit: p.produit ?? undefined,
    montant: p.montant ?? undefined,
    pourcentage: p.pourcentage ?? undefined,
  }));
}

interface Props {
  /** Présent : édition d'un Tippspiel existant (ex. brouillon avant publication).
   * Absent : création d'un nouveau Tippspiel. */
  tippspiel?: Tippspiel;
  onTermine: () => void;
}

export default function TippspielAdminForm({ tippspiel, onTermine }: Props) {
  const { t } = useTranslation("communaute");
  const produitsQuery = useProduits();
  const creer = useCreerTippspiel();
  const modifier = useModifierTippspiel();

  const [titre, setTitre] = useState(tippspiel?.titre ?? "");
  const [saison, setSaison] = useState(tippspiel?.saison ?? "");
  const [regles, setRegles] = useState(tippspiel?.regles ?? "");
  const [montantParticipation, setMontantParticipation] = useState(
    tippspiel?.montant_participation ?? "",
  );
  const [prix, setPrix] = useState<TippspielPrixPayload[]>(prixInitiaux(tippspiel));
  const [erreur, setErreur] = useState("");

  const enCours = creer.isPending || modifier.isPending;

  function ajouterPrix() {
    setPrix((liste) => [
      ...liste,
      { platz: liste.length + 1, type_prix: "montant_fixe" as TypePrixTippspiel, montant: "" },
    ]);
  }

  function retirerPrix(index: number) {
    setPrix((liste) => liste.filter((_, i) => i !== index));
  }

  function mettreAJourPrix(index: number, changement: Partial<TippspielPrixPayload>) {
    setPrix((liste) => liste.map((p, i) => (i === index ? { ...p, ...changement } : p)));
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim() || !saison.trim()) return;
    setErreur("");
    const payload = {
      titre,
      saison,
      regles,
      montant_participation: montantParticipation.trim() || null,
      prix: prix.map((p) => ({
        platz: p.platz,
        type_prix: p.type_prix,
        produit: p.type_prix === "produit" ? p.produit : undefined,
        montant: p.type_prix === "montant_fixe" ? p.montant : undefined,
        pourcentage: p.type_prix === "pourcentage" ? p.pourcentage : undefined,
      })),
    };
    const onError = (err: unknown) =>
      setErreur(
        extractApiErrorMessage(
          err,
          tippspiel ? t("tippspiel.admin_speichern_fehler") : t("tippspiel.admin_erstellen_fehler"),
        ),
      );
    if (tippspiel) {
      modifier.mutate({ id: tippspiel.id, payload }, { onSuccess: onTermine, onError });
    } else {
      creer.mutate(payload, { onSuccess: onTermine, onError });
    }
  }

  return (
    <form
      onSubmit={soumettre}
      className="space-y-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
      aria-label={t("tippspiel.titre")}
    >
      <input
        type="text"
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder={t("tippspiel.admin_titel_placeholder")}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <input
        type="text"
        value={saison}
        onChange={(e) => setSaison(e.target.value)}
        placeholder={t("tippspiel.admin_saison_placeholder")}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <textarea
        value={regles}
        onChange={(e) => setRegles(e.target.value)}
        placeholder={t("tippspiel.admin_regeln_placeholder")}
        rows={3}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("tippspiel.admin_beitrag_label")}
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={montantParticipation ?? ""}
          onChange={(e) => setMontantParticipation(e.target.value)}
          placeholder={t("tippspiel.admin_beitrag_placeholder")}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-2 border-t border-text-tertiary/10 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-text-tertiary">
            {t("tippspiel.admin_preise_titel")}
          </h3>
          <button
            type="button"
            onClick={ajouterPrix}
            className="rounded-cid bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-cal"
          >
            {t("tippspiel.admin_preis_hinzufuegen")}
          </button>
        </div>
        {prix.map((p, index) => (
          <div
            key={index}
            className="flex flex-wrap items-end gap-2 rounded-cid border border-text-tertiary/20 p-2"
          >
            <div>
              <label
                htmlFor={`prix-platz-${index}`}
                className="mb-1 block text-[10px] font-medium text-text-secondary"
              >
                {t("tippspiel.admin_preis_platz_label")}
              </label>
              <input
                id={`prix-platz-${index}`}
                type="number"
                min={1}
                value={p.platz}
                onChange={(e) => mettreAJourPrix(index, { platz: Number(e.target.value) || 1 })}
                className="w-16 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`prix-typ-${index}`}
                className="mb-1 block text-[10px] font-medium text-text-secondary"
              >
                {t("tippspiel.admin_preis_typ_label")}
              </label>
              <select
                id={`prix-typ-${index}`}
                value={p.type_prix}
                onChange={(e) =>
                  mettreAJourPrix(index, { type_prix: e.target.value as TypePrixTippspiel })
                }
                className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
              >
                <option value="montant_fixe">{t("tippspiel.admin_preis_typ_montant_fixe")}</option>
                <option value="pourcentage">{t("tippspiel.admin_preis_typ_pourcentage")}</option>
                <option value="produit">{t("tippspiel.admin_preis_typ_produkt")}</option>
              </select>
            </div>
            {p.type_prix === "produit" && (
              <div>
                <label
                  htmlFor={`prix-produit-${index}`}
                  className="mb-1 block text-[10px] font-medium text-text-secondary"
                >
                  {t("tippspiel.admin_preis_produkt_label")}
                </label>
                <select
                  id={`prix-produit-${index}`}
                  value={p.produit ?? ""}
                  onChange={(e) => mettreAJourPrix(index, { produit: e.target.value })}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                >
                  <option value="">{t("tippspiel.admin_preis_produkt_waehlen")}</option>
                  {(produitsQuery.data?.results ?? []).map((produit) => (
                    <option key={produit.id} value={produit.id}>
                      {produit.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {p.type_prix === "montant_fixe" && (
              <div>
                <label
                  htmlFor={`prix-montant-${index}`}
                  className="mb-1 block text-[10px] font-medium text-text-secondary"
                >
                  {t("tippspiel.admin_preis_betrag_label")}
                </label>
                <input
                  id={`prix-montant-${index}`}
                  type="text"
                  inputMode="decimal"
                  value={p.montant ?? ""}
                  onChange={(e) => mettreAJourPrix(index, { montant: e.target.value })}
                  className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                />
              </div>
            )}
            {p.type_prix === "pourcentage" && (
              <div>
                <label
                  htmlFor={`prix-prozent-${index}`}
                  className="mb-1 block text-[10px] font-medium text-text-secondary"
                >
                  {t("tippspiel.admin_preis_prozent_label")}
                </label>
                <input
                  id={`prix-prozent-${index}`}
                  type="text"
                  inputMode="decimal"
                  value={p.pourcentage ?? ""}
                  onChange={(e) => mettreAJourPrix(index, { pourcentage: e.target.value })}
                  className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => retirerPrix(index)}
              className="ml-auto rounded-cid px-2 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg"
            >
              {t("tippspiel.admin_preis_entfernen")}
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-text-tertiary/10 pt-3">
        <button
          type="submit"
          disabled={enCours}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {tippspiel ? t("tippspiel.admin_speichern") : t("tippspiel.admin_erstellen")}
        </button>
        <button
          type="button"
          onClick={onTermine}
          className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary"
        >
          {t("tippspiel.admin_abbrechen")}
        </button>
      </div>
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
    </form>
  );
}
