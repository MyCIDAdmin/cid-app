/**
 * Gestion des offres d'une campagne — panneau dépliable d'AdminCampagnesPage (demande
 * utilisateur du 2026-09-16, analogue à OffreAdhesionInline de Django Admin — voir
 * apps/adhesions/admin.py). Remplace le renvoi vers Django Admin acté dans une itération
 * précédente (voir historique du docstring d'AdminCampagnesPage).
 *
 * "Avantages (un par ligne)" reprend l'interaction du mockup #m-newcamp étape 2 : chaque ligne
 * du textarea devient un avantage trilingue {ordre, texte_fr, texte_de: "", texte_ar: ""} —
 * seul le français est saisi ici, comme le reste de ce formulaire (label_de/ar restent éditables
 * via Django Admin si besoin, cf. RabaisManager).
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true`, voir
 * AdminCampagnesPage) désactive l'ajout/modification/suppression d'offres et se propage à
 * RabaisManager.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerOffre,
  useModifierOffre,
  useSupprimerOffre,
  useTeleverserIconeOffre,
} from "../../hooks/useAdhesions";
import type {
  CampagneAdhesion,
  CouleurOffre,
  KartenStil,
  OffreCreatePayload,
} from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";
import { KARTEN_STILE } from "./kartenstile";
import RabaisManager from "./RabaisManager";

// Retour utilisateur du 2026-09-29 ("Verwaltung der Mitgliedschaftskampagnen" : "2. Färblich
// highlighten") — reprend les 3 mêmes emplacements que ACCENTS_OFFRE côté MonAdhesionPage.tsx,
// jamais un sélecteur de couleur libre (voir le docstring backend de CouleurOffre).
const OPTIONS_COULEUR: CouleurOffre[] = ["", "cat_1", "cat_2", "cat_3"];

// Look der digitalen Mitgliedskarte (2026-10-06) — leer = Rubin (CID-Rot).
const OPTIONS_KARTENSTIL: KartenStil[] = [...KARTEN_STILE];

function formulaireInitial(campagneId: string): OffreCreatePayload & { avantages_texte: string } {
  return {
    campagne: campagneId,
    nom: "",
    prix_plein: "0.00",
    description: "",
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 0,
    avantages_texte: "",
  };
}

function avantagesDepuisTexte(texte: string) {
  return texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .map((texte_fr, index) => ({ ordre: index + 1, texte_fr, texte_de: "", texte_ar: "" }));
}

export default function OffresManager({
  campagne,
  modifiable = true,
}: {
  campagne: CampagneAdhesion;
  modifiable?: boolean;
}) {
  const { t } = useTranslation(["adhesions", "common"]);
  const creerMutation = useCreerOffre();
  const modifierMutation = useModifierOffre();
  const supprimerMutation = useSupprimerOffre();
  const iconeMutation = useTeleverserIconeOffre();

  const [form, setForm] = useState(() => formulaireInitial(campagne.id));
  const [offreDepliee, setOffreDepliee] = useState<string | null>(null);

  function handleAjouter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { avantages_texte, ...payload } = form;
    creerMutation.mutate(
      { ...payload, avantages: avantagesDepuisTexte(avantages_texte) },
      { onSuccess: () => setForm(formulaireInitial(campagne.id)) },
    );
  }

  // Garde de défense en profondeur (2026-09-24, retour utilisateur task #216) : le `disabled`
  // sur les champs correspondants bloque déjà l'interaction utilisateur normale (un input/
  // checkbox disabled ne peut recevoir ni focus ni clic réel) — mais ces deux handlers sont
  // déclenchés par onBlur/onChange, pas par un <button disabled>, donc rien n'empêche un appel
  // programmatique de les invoquer quand même. Le backend reste la seule source de vérité
  // (rejette de toute façon en 403), mais ce garde évite un appel réseau inutile/trompeur.
  function toggleVisible(offreId: string, visible: boolean) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: offreId, payload: { visible } });
  }

  function modifierPrix(offreId: string, valeur: string) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: offreId, payload: { prix_plein: valeur } });
  }

  function modifierCouleur(offreId: string, couleur: CouleurOffre) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: offreId, payload: { couleur } });
  }

  function modifierKartenstil(offreId: string, kartenstil: KartenStil | "") {
    if (!modifiable) return;
    modifierMutation.mutate({ id: offreId, payload: { kartenstil } });
  }

  function togglePopulaire(offreId: string, populaire: boolean) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: offreId, payload: { populaire } });
  }

  function handleIconeChange(offreId: string, e: ChangeEvent<HTMLInputElement>) {
    if (!modifiable) return;
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    iconeMutation.mutate({ id: offreId, fichier });
    e.target.value = "";
  }

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-tertiary/30 p-3">
      <h3 className="mb-2 text-xs font-bold text-text-primary">{t("admin_offres.titre")}</h3>

      <div className="space-y-2">
        {campagne.offres.map((offre) => (
          <div
            key={offre.id}
            className="rounded-cid border border-text-tertiary/20 bg-bg-primary p-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex-1 font-semibold text-text-primary">{offre.nom}</span>
              <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                {t("admin_offres.prix_label")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`${t("admin_offres.prix_label")} — ${offre.nom}`}
                  defaultValue={offre.prix_plein}
                  onBlur={(e) => modifierPrix(offre.id, e.target.value)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="w-16 rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs disabled:opacity-40"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={offre.visible}
                  onChange={(e) => toggleVisible(offre.id, e.target.checked)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                />
                {t("admin_offres.visible_label")}
              </label>
              {/* Retour utilisateur (2026-09-24, task #216) : même principe que le bouton
                  "gérer les offres" de AdminCampagnesPage — c'est un dépli/repli d'affichage,
                  pas une action d'écriture, mais le libellé en lecture seule doit refléter
                  qu'aucune modification n'est possible derrière. */}
              <button
                type="button"
                onClick={() => setOffreDepliee((cur) => (cur === offre.id ? null : offre.id))}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
              >
                {offreDepliee === offre.id
                  ? t("admin_offres.masquer_rabais")
                  : modifiable
                    ? t("admin_offres.gerer_rabais")
                    : t("admin_offres.voir_rabais")}
              </button>
              <button
                type="button"
                onClick={() => supprimerMutation.mutate(offre.id)}
                disabled={!modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="text-text-tertiary hover:text-status-dangerText disabled:opacity-40"
                aria-label={`${t("admin_offres.supprimer")} — ${offre.nom}`}
              >
                ✕
              </button>
            </div>
            {/* Retour utilisateur du 2026-09-29 ("Verwaltung der Mitgliedschaftskampagnen" :
                "1. Icons für jede Angebotskachel hochladen 2. Färblich highlighten 3. Tags
                hinzufügen wie... der Tag 'Popular'") — appliqué en PATCH immédiat, même
                principe que toggleVisible/modifierPrix ci-dessus. */}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-text-tertiary/10 pt-2 text-xs">
              {offre.icone ? (
                <img
                  src={offre.icone}
                  alt={t("admin_offres.icone_alt", { nom: offre.nom })}
                  className="h-8 w-8 rounded-cid object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-cid border border-dashed border-text-tertiary/30 text-[10px] text-text-tertiary">
                  {t("admin_offres.icone_label")}
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label={`${offre.icone ? t("admin_offres.icone_changer") : t("admin_offres.icone_ajouter")} — ${offre.nom}`}
                onChange={(e) => handleIconeChange(offre.id, e)}
                disabled={!modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="w-32 text-[10px] text-text-secondary disabled:opacity-40"
              />
              <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                {t("admin_offres.couleur_label")}
                <select
                  aria-label={`${t("admin_offres.couleur_label")} — ${offre.nom}`}
                  value={offre.couleur}
                  onChange={(e) => modifierCouleur(offre.id, e.target.value as CouleurOffre)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs disabled:opacity-40"
                >
                  {OPTIONS_COULEUR.map((valeur) => (
                    <option key={valeur || "auto"} value={valeur}>
                      {valeur === ""
                        ? t("admin_offres.couleur_auto")
                        : t(`admin_offres.couleur_${valeur}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                {t("admin_offres.kartenstil_label")}
                <select
                  aria-label={`${t("admin_offres.kartenstil_label")} — ${offre.nom}`}
                  value={offre.kartenstil ?? ""}
                  onChange={(e) => modifierKartenstil(offre.id, e.target.value as KartenStil | "")}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs disabled:opacity-40"
                >
                  <option value="">{t("admin_offres.kartenstil_standard")}</option>
                  {OPTIONS_KARTENSTIL.map((wert) => (
                    <option key={wert} value={wert}>
                      {t(`admin_offres.kartenstil_${wert}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={offre.populaire}
                  onChange={(e) => togglePopulaire(offre.id, e.target.checked)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                />
                {t("admin_offres.populaire_label")}
              </label>
              {iconeMutation.isError && (
                <p className="w-full text-[10px] text-status-dangerText">
                  {extractApiErrorMessage(iconeMutation.error, t("admin_offres.erreur_icone"))}
                </p>
              )}
            </div>
            {offreDepliee === offre.id && <RabaisManager offre={offre} modifiable={modifiable} />}
          </div>
        ))}
        {campagne.offres.length === 0 && (
          <p className="text-xs text-text-tertiary">{t("admin_offres.aucune")}</p>
        )}
      </div>

      <form
        onSubmit={handleAjouter}
        className="mt-3 grid gap-2 border-t border-text-tertiary/10 pt-3 md:grid-cols-2"
      >
        <div>
          <label
            htmlFor={`offre-nom-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.nom_label")}
          </label>
          <input
            id={`offre-nom-${campagne.id}`}
            required
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor={`offre-prix-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.prix_label")}
          </label>
          <input
            id={`offre-prix-${campagne.id}`}
            type="number"
            min="0"
            step="0.01"
            required
            value={form.prix_plein}
            onChange={(e) => setForm({ ...form, prix_plein: e.target.value })}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor={`offre-desc-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.description_label")}
          </label>
          <input
            id={`offre-desc-${campagne.id}`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor={`offre-avantages-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.avantages_label")}
          </label>
          <textarea
            id={`offre-avantages-${campagne.id}`}
            rows={2}
            value={form.avantages_texte}
            onChange={(e) => setForm({ ...form, avantages_texte: e.target.value })}
            placeholder={t("admin_offres.avantages_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor={`offre-age-min-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.age_min_label")}
          </label>
          <input
            id={`offre-age-min-${campagne.id}`}
            type="number"
            min="0"
            value={form.condition_age_min ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                condition_age_min: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor={`offre-age-max-${campagne.id}`}
            className="mb-1 block text-[10px] text-text-tertiary"
          >
            {t("admin_offres.age_max_label")}
          </label>
          <input
            id={`offre-age-max-${campagne.id}`}
            type="number"
            min="0"
            value={form.condition_age_max ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                condition_age_max: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </div>

        {creerMutation.isError && (
          <p className="text-xs text-status-dangerText md:col-span-2">
            {extractApiErrorMessage(creerMutation.error, t("admin_offres.erreur"))}
          </p>
        )}

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={creerMutation.isPending || !modifiable}
            title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("admin_offres.ajouter")}
          </button>
        </div>
      </form>
    </div>
  );
}
