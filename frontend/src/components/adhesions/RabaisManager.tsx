/**
 * Gestion des rabais d'une offre — panneau dépliable d'OffresManager (demande utilisateur du
 * 2026-09-16, analogue à RabaisOffreInline de Django Admin — voir apps/adhesions/admin.py).
 *
 * montant_reduction et pct_reduction sont mutuellement exclusifs côté backend (contrainte
 * rabais_montant_xor_pourcentage, voir models.py) : le formulaire n'expose donc qu'un seul champ
 * "valeur" avec un sélecteur de type, jamais les deux à la fois (même logique que l'étape 3 du
 * mockup #m-newcamp).
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true`, voir
 * OffresManager) désactive l'ajout/modification/suppression de rabais.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerRabais,
  useModifierRabais,
  useSupprimerRabais,
} from "../../hooks/useAdhesions";
import type { OffreAdhesion, RabaisCreatePayload, TypeRabais } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";

const TYPES_RABAIS: TypeRabais[] = ["etudiant", "famille", "senior", "autre"];

type TypeValeur = "montant" | "pct";

function formulaireInitial(offreId: string): RabaisCreatePayload & { type_valeur: TypeValeur } {
  return {
    offre: offreId,
    type_rabais: "etudiant",
    label_fr: "",
    label_de: "",
    montant_reduction: "",
    pct_reduction: null,
    justificatif_requis: false,
    instructions_fr: "",
    instructions_de: "",
    type_valeur: "montant",
  };
}

export default function RabaisManager({
  offre,
  modifiable = true,
}: {
  offre: OffreAdhesion;
  modifiable?: boolean;
}) {
  const { t } = useTranslation(["adhesions", "common"]);
  const creerMutation = useCreerRabais();
  const modifierMutation = useModifierRabais();
  const supprimerMutation = useSupprimerRabais();

  const [form, setForm] = useState(() => formulaireInitial(offre.id));

  function handleAjouter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { type_valeur, ...payload } = form;
    creerMutation.mutate(
      {
        ...payload,
        montant_reduction: type_valeur === "montant" ? payload.montant_reduction || "0" : null,
        pct_reduction: type_valeur === "pct" ? payload.pct_reduction || "0" : null,
      },
      { onSuccess: () => setForm(formulaireInitial(offre.id)) },
    );
  }

  // Garde de défense en profondeur — voir OffresManager.toggleVisible/modifierPrix pour le
  // raisonnement complet (onChange, pas un <button disabled>, donc rien n'empêche un appel
  // programmatique malgré le `disabled` posé sur la case à cocher correspondante).
  function toggleJustificatifRequis(rabaisId: string, valeur: boolean) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: rabaisId, payload: { justificatif_requis: valeur } });
  }

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3">
      <h4 className="mb-2 text-[11px] font-bold text-text-primary">
        {t("admin_rabais.titre")}
      </h4>
      <div className="space-y-1.5">
        {offre.rabais.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex-1 font-medium">{r.label_fr}</span>
            <span className="text-text-tertiary">{t(`type_rabais.${r.type_rabais}`)}</span>
            <span className="text-text-tertiary">
              {r.montant_reduction ? `-${r.montant_reduction} €` : `-${r.pct_reduction} %`}
            </span>
            <label className="flex items-center gap-1 text-[10px] text-text-secondary">
              <input
                type="checkbox"
                checked={r.justificatif_requis}
                onChange={(e) => toggleJustificatifRequis(r.id, e.target.checked)}
                disabled={!modifiable}
                title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              />
              {t("admin_rabais.justificatif_requis_label")}
            </label>
            <button
              type="button"
              onClick={() => supprimerMutation.mutate(r.id)}
              disabled={!modifiable}
              title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              className="text-text-tertiary hover:text-status-dangerText disabled:opacity-40"
              aria-label={`${t("admin_rabais.supprimer")} — ${r.label_fr}`}
            >
              ✕
            </button>
          </div>
        ))}
        {offre.rabais.length === 0 && (
          <p className="text-xs text-text-tertiary">{t("admin_rabais.aucun")}</p>
        )}
      </div>

      <form onSubmit={handleAjouter} className="mt-2 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor={`rabais-type-${offre.id}`}
              className="block text-[10px] text-text-tertiary"
            >
              {t("admin_rabais.type_label")}
            </label>
            <select
              id={`rabais-type-${offre.id}`}
              value={form.type_rabais}
              onChange={(e) => setForm({ ...form, type_rabais: e.target.value as TypeRabais })}
              className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            >
              {TYPES_RABAIS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`type_rabais.${tr}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`rabais-label-${offre.id}`}
              className="block text-[10px] text-text-tertiary"
            >
              {t("admin_rabais.label_fr_label")}
            </label>
            <input
              id={`rabais-label-${offre.id}`}
              required
              value={form.label_fr}
              onChange={(e) => setForm({ ...form, label_fr: e.target.value })}
              className="w-32 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor={`rabais-valeur-type-${offre.id}`}
              className="block text-[10px] text-text-tertiary"
            >
              {t("admin_rabais.valeur_type_label")}
            </label>
            <select
              id={`rabais-valeur-type-${offre.id}`}
              value={form.type_valeur}
              onChange={(e) => setForm({ ...form, type_valeur: e.target.value as TypeValeur })}
              className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            >
              <option value="montant">{t("admin_rabais.type_montant")}</option>
              <option value="pct">{t("admin_rabais.type_pct")}</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`rabais-valeur-${offre.id}`}
              className="block text-[10px] text-text-tertiary"
            >
              {t("admin_rabais.valeur_label")}
            </label>
            <input
              id={`rabais-valeur-${offre.id}`}
              type="number"
              min="0"
              step="0.01"
              required
              value={
                form.type_valeur === "montant"
                  ? form.montant_reduction ?? ""
                  : form.pct_reduction ?? ""
              }
              onChange={(e) =>
                setForm(
                  form.type_valeur === "montant"
                    ? { ...form, montant_reduction: e.target.value }
                    : { ...form, pct_reduction: e.target.value },
                )
              }
              className="w-20 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            />
          </div>
          <label className="flex items-center gap-1 text-[10px] text-text-secondary">
            <input
              type="checkbox"
              checked={form.justificatif_requis}
              onChange={(e) => setForm({ ...form, justificatif_requis: e.target.checked })}
            />
            {t("admin_rabais.justificatif_requis_label")}
          </label>
        </div>
        {form.justificatif_requis && (
          <input
            value={form.instructions_fr}
            onChange={(e) => setForm({ ...form, instructions_fr: e.target.value })}
            placeholder={t("admin_rabais.instructions_placeholder")}
            aria-label={t("admin_rabais.instructions_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
        )}
        {creerMutation.isError && (
          <p className="text-[11px] text-status-dangerText">
            {extractApiErrorMessage(creerMutation.error, t("admin_rabais.erreur"))}
          </p>
        )}
        <button
          type="submit"
          disabled={creerMutation.isPending || !modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="self-start rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("admin_rabais.ajouter")}
        </button>
      </form>
    </div>
  );
}
