/**
 * Wizard admin — création d'une session de vote en 3 étapes (mockup #m-create-vote, FDD F-008,
 * RICEFW W-006 : lancement immédiat, pas de brouillon). Le mockup présente ce flux en modal ;
 * il est repris ici comme page pleine dédiée (`/votes/creer`), cohérent avec le reste de
 * l'application où les parcours multi-étapes (paiement, adhésion) sont des pages, pas des
 * fenêtres modales (voir CotisationStepperPage).
 *
 * Les 3 étapes sont soumises en un seul POST /votes/ à la confirmation de l'étape 3 —
 * VoteSessionCreateSerializer accepte les options en écriture imbriquée (voir docstring
 * backend).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";

import { useMembresList } from "../../hooks/useMembres";
import { useCreerVoteSession } from "../../hooks/useVote";
import { useAuthStore } from "../../store/authStore";
import type { EligibiliteVote, ModeAnonymat, TypeVote, VoteOptionInput } from "../../types/vote";
import { extractApiErrorMessage } from "../../utils/apiError";

const DUREES_MINUTES = [10, 20, 30, 60, 360, 1440, 4320, 10080];

// Ensemble de rôles exact autorisé à créer une session (voir même constante et son
// commentaire dans VotePage.tsx — Dir. Financier explicitement exclu malgré un niveau
// numérique supérieur à Bureau Admin, SCD §4.2 / apps.vote.permissions.ROLES_GESTION_VOTE).
const ROLES_GESTION_VOTE = ["super_admin", "bureau_admin"] as const;

// FDD §5.2 : "plusieurs listes de candidats peuvent se présenter" (ex. élection du bureau
// directeur) — une VoteOption reste l'unité de vote, mais représente soit un candidat
// individuel (mode historique), soit une liste portant plusieurs candidats (voir backend
// VoteOptionCandidat). Ce mode ne change que la forme des options créées ici, pas le
// type_vote lui-même (une élection par listes reste typiquement un choix unique).
type ModeCandidature = "individuel" | "liste";

function optionsParDefaut(type: TypeVote, mode: ModeCandidature): VoteOptionInput[] {
  if (type === "oui_non") {
    return [{ label: "Oui" }, { label: "Non" }, { label: "Abstention" }];
  }
  if (mode === "liste") {
    return [
      { label: "", candidats: [{ nom: "" }, { nom: "" }] },
      { label: "", candidats: [{ nom: "" }, { nom: "" }] },
    ];
  }
  return [{ label: "" }, { label: "" }];
}

export default function CreerVoteWizardPage() {
  const { t } = useTranslation("vote");
  const navigate = useNavigate();
  const creerMutation = useCreerVoteSession();
  const user = useAuthStore((s) => s.user);
  const autorise = Boolean(
    user && ROLES_GESTION_VOTE.includes(user.role as (typeof ROLES_GESTION_VOTE)[number]),
  );

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [erreurEtape, setErreurEtape] = useState<string | null>(null);

  // Étape 1 — paramètres
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [typeVote, setTypeVote] = useState<TypeVote>("unique");
  const [nbChoixMax, setNbChoixMax] = useState(2);
  const [dureeMinutes, setDureeMinutes] = useState(30);
  const [modeAnonymat, setModeAnonymat] = useState<ModeAnonymat>("anonyme");
  const [eligibilite, setEligibilite] = useState<EligibiliteVote>("tous_actifs");
  const [quorumPct, setQuorumPct] = useState<string>("");
  // Sélection manuelle (FDD §5.2 "Sélection manuelle…") — un vote peut aussi être réservé à un
  // groupe précis de membres (un comité, une commission…), pas seulement aux 3 catégories
  // génériques ci-dessus ou à un unique membre à la fois.
  const [membresSelectionnes, setMembresSelectionnes] = useState<string[]>([]);
  const [rechercheMembre, setRechercheMembre] = useState("");
  const membresQuery = useMembresList({ statut: "actif", q: rechercheMembre }, null, {
    enabled: eligibilite === "selection_manuelle",
  });

  function toggleMembreSelectionne(id: string) {
    setMembresSelectionnes((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  // Étape 2 — options
  const [modeCandidature, setModeCandidature] = useState<ModeCandidature>("individuel");
  const [options, setOptions] = useState<VoteOptionInput[]>(optionsParDefaut("unique", "individuel"));

  function changerType(type: TypeVote) {
    setTypeVote(type);
    setOptions(optionsParDefaut(type, modeCandidature));
  }

  function changerModeCandidature(mode: ModeCandidature) {
    setModeCandidature(mode);
    setOptions(optionsParDefaut(typeVote, mode));
  }

  function ajouterOption() {
    setOptions((prev) => [
      ...prev,
      modeCandidature === "liste" ? { label: "", candidats: [{ nom: "" }, { nom: "" }] } : { label: "" },
    ]);
  }

  function supprimerOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function modifierOption(index: number, champ: keyof VoteOptionInput, valeur: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, [champ]: valeur } : o)));
  }

  // Composition d'une liste (mode "liste" uniquement) — chaque option porte ses propres
  // candidats, saisis comme des noms libres (cohérent avec les options elles-mêmes, qui
  // sont déjà des labels libres, pas des membres liés).
  function ajouterCandidat(indexOption: number) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === indexOption ? { ...o, candidats: [...(o.candidats ?? []), { nom: "" }] } : o,
      ),
    );
  }

  function supprimerCandidat(indexOption: number, indexCandidat: number) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === indexOption
          ? { ...o, candidats: (o.candidats ?? []).filter((_, j) => j !== indexCandidat) }
          : o,
      ),
    );
  }

  function modifierCandidat(indexOption: number, indexCandidat: number, nom: string) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === indexOption
          ? {
              ...o,
              candidats: (o.candidats ?? []).map((c, j) => (j === indexCandidat ? { nom } : c)),
            }
          : o,
      ),
    );
  }

  function allerEtape2() {
    if (!titre.trim() || !description.trim()) {
      setErreurEtape(t("wizard.erreur_titre_requis"));
      return;
    }
    if (eligibilite === "selection_manuelle" && membresSelectionnes.length === 0) {
      setErreurEtape(t("wizard.erreur_membres_requis"));
      return;
    }
    setErreurEtape(null);
    setEtape(2);
  }

  // Nettoie les options avant validation/soumission : labels/noms de candidats vidés de
  // leurs espaces, candidats vides retirés — pour le mode "liste", `candidats` reste un
  // tableau (éventuellement vide) ; pour le mode "individuel", il est omis (comportement
  // historique, rétrocompatible avec le payload backend existant).
  function optionsPreparees(): VoteOptionInput[] {
    return options
      .filter((o) => o.label.trim())
      .map((o) => {
        const base = { label: o.label.trim(), description: o.description };
        if (modeCandidature !== "liste") return base;
        return {
          ...base,
          candidats: (o.candidats ?? [])
            .map((c) => ({ nom: c.nom.trim() }))
            .filter((c) => c.nom),
        };
      });
  }

  function allerEtape3() {
    const optionsValides = optionsPreparees();
    if (optionsValides.length < 2) {
      setErreurEtape(t("wizard.erreur_options_min"));
      return;
    }
    if (modeCandidature === "liste" && optionsValides.some((o) => !o.candidats?.length)) {
      setErreurEtape(t("wizard.erreur_candidats_min"));
      return;
    }
    setErreurEtape(null);
    setEtape(3);
  }

  function lancerVote() {
    creerMutation.mutate(
      {
        titre: titre.trim(),
        description: description.trim(),
        type_vote: typeVote,
        mode_anonymat: modeAnonymat,
        nb_choix_max: typeVote === "multiple" ? nbChoixMax : 1,
        eligibilite,
        membres_selectionnes:
          eligibilite === "selection_manuelle" ? membresSelectionnes : undefined,
        duree_minutes: dureeMinutes,
        quorum_pct: quorumPct ? Number(quorumPct) : null,
        resultats_visibles_avant_cloture: false,
        options: optionsPreparees(),
      },
      {
        onSuccess: () => navigate("/votes"),
      },
    );
  }

  const optionsValides = optionsPreparees();
  const optionsModifiables = typeVote !== "oui_non";

  if (!autorise) {
    return <Navigate to="/votes" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("wizard.titre_page")}</h1>

      <div className="mb-5 flex items-center gap-3">
        {(
          [
            { n: 1, label: t("wizard.etape_parametres") },
            { n: 2, label: t("wizard.etape_options") },
            { n: 3, label: t("wizard.etape_confirmer") },
          ] as const
        ).map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            {i > 0 && <div className="h-px w-6 bg-text-tertiary/30" />}
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  etape >= s.n ? "bg-ca text-white" : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {s.n}
              </div>
              <span
                className={`text-xs font-medium ${etape === s.n ? "text-text-primary" : "text-text-tertiary"}`}
              >
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {erreurEtape && (
        <p className="mb-3 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText">
          {erreurEtape}
        </p>
      )}
      {creerMutation.isError && (
        <p className="mb-3 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(creerMutation.error, t("wizard.erreur_creation"))}
        </p>
      )}

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        {etape === 1 && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("wizard.titre_session")} <span className="text-ca">*</span>
              </label>
              <input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder={t("wizard.titre_placeholder")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("wizard.description_session")} <span className="text-ca">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t("wizard.description_placeholder")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.type_vote")}
                </label>
                <select
                  value={typeVote}
                  onChange={(e) => changerType(e.target.value as TypeVote)}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  <option value="unique">{t("wizard.type_unique")}</option>
                  <option value="multiple">{t("wizard.type_multiple")}</option>
                  <option value="oui_non">{t("wizard.type_oui_non")}</option>
                  <option value="preferentiel">{t("wizard.type_preferentiel")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.nb_choix_max")}
                </label>
                <input
                  type="number"
                  min={1}
                  disabled={typeVote !== "multiple"}
                  value={nbChoixMax}
                  onChange={(e) => setNbChoixMax(Number(e.target.value))}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("wizard.duree")}
              </label>
              <select
                value={dureeMinutes}
                onChange={(e) => setDureeMinutes(Number(e.target.value))}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                {DUREES_MINUTES.map((d) => (
                  <option key={d} value={d}>
                    {t(`wizard.duree_${d}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("wizard.confidentialite")}
              </label>
              <div className="space-y-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-cid border px-3 py-2 ${
                    modeAnonymat === "anonyme" ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                  }`}
                >
                  <input
                    type="radio"
                    checked={modeAnonymat === "anonyme"}
                    onChange={() => setModeAnonymat("anonyme")}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-text-secondary">
                    🔒 {t("wizard.anonyme_description")}
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-cid border px-3 py-2 ${
                    modeAnonymat === "nominatif" ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                  }`}
                >
                  <input
                    type="radio"
                    checked={modeAnonymat === "nominatif"}
                    onChange={() => setModeAnonymat("nominatif")}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-text-secondary">
                    👁 {t("wizard.nominatif_description")}
                  </span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.membres_eligibles")}
                </label>
                <select
                  value={eligibilite}
                  onChange={(e) => setEligibilite(e.target.value as EligibiliteVote)}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  <option value="tous_actifs">{t("wizard.eligibilite_tous_actifs")}</option>
                  <option value="cotisants">{t("wizard.eligibilite_cotisants")}</option>
                  <option value="bureau">{t("wizard.eligibilite_bureau")}</option>
                  <option value="selection_manuelle">
                    {t("wizard.eligibilite_selection_manuelle")}
                  </option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.quorum")}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={quorumPct}
                  onChange={(e) => setQuorumPct(e.target.value)}
                  placeholder={t("wizard.quorum_placeholder")}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* Sélection manuelle — un vote peut cibler un groupe précis de membres (une
                commission, un comité...), pas seulement un individu à la fois : la recherche
                filtre parmi les membres actifs et chaque coche ajoute/retire ce membre du
                groupe visé par cette session (membres_selectionnes, requis côté backend
                lorsque eligibilite=selection_manuelle — voir VoteSessionCreateSerializer). */}
            {eligibilite === "selection_manuelle" && (
              <div className="rounded-cid border border-text-tertiary/20 p-3">
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.rechercher_membres")}
                </label>
                <input
                  value={rechercheMembre}
                  onChange={(e) => setRechercheMembre(e.target.value)}
                  placeholder={t("wizard.rechercher_membres_placeholder")}
                  className="mb-2 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {membresQuery.isLoading && (
                    <p className="text-xs text-text-tertiary">{t("historique.chargement")}</p>
                  )}
                  {membresQuery.data?.results.length === 0 && (
                    <p className="text-xs text-text-tertiary">{t("wizard.aucun_membre")}</p>
                  )}
                  {membresQuery.data?.results.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-cid px-2 py-1 text-sm hover:bg-bg-tertiary"
                    >
                      <input
                        type="checkbox"
                        checked={membresSelectionnes.includes(m.id)}
                        onChange={() => toggleMembreSelectionne(m.id)}
                      />
                      <span className="text-text-primary">
                        {m.prenom} {m.nom}
                      </span>
                      <span className="text-xs text-text-tertiary">{m.ville_de}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-text-tertiary">
                  {t("wizard.membres_selectionnes_count", { count: membresSelectionnes.length })}
                </p>
              </div>
            )}

            <p className="text-[11px] text-text-tertiary">ℹ {t("wizard.notifier_membres_auto")}</p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate("/votes")}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("wizard.annuler")}
              </button>
              <button
                type="button"
                onClick={allerEtape2}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
              >
                {t("wizard.suivant")}
              </button>
            </div>
          </div>
        )}

        {etape === 2 && (
          <div className="space-y-3">
            {optionsModifiables && (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("wizard.mode_candidature")}
                </label>
                <div className="flex gap-2">
                  {(["individuel", "liste"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changerModeCandidature(mode)}
                      className={`flex-1 rounded-cid border px-3 py-1.5 text-xs font-medium ${
                        modeCandidature === mode
                          ? "border-ca bg-cal/20 text-text-primary"
                          : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
                      }`}
                    >
                      {t(`wizard.mode_candidature_${mode}`)}
                    </button>
                  ))}
                </div>
                {modeCandidature === "liste" && (
                  <p className="mt-1.5 text-[11px] text-text-tertiary">
                    ℹ {t("wizard.mode_candidature_liste_description")}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-text-secondary">{t(`wizard.hint_${typeVote}`)}</p>
            <div className="space-y-2">
              {options.map((option, index) =>
                modeCandidature === "liste" && optionsModifiables ? (
                  <div key={index} className="rounded-cid border border-text-tertiary/20 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-xs font-bold text-text-secondary">
                        {index + 1}
                      </span>
                      <input
                        value={option.label}
                        onChange={(e) => modifierOption(index, "label", e.target.value)}
                        placeholder={t("wizard.nom_liste_placeholder", { n: index + 1 })}
                        className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm font-semibold"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => supprimerOption(index)}
                          className="shrink-0 rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="mt-2 space-y-1.5 pl-8">
                      {(option.candidats ?? []).map((candidat, indexCandidat) => (
                        <div key={indexCandidat} className="flex items-center gap-2">
                          <input
                            value={candidat.nom}
                            onChange={(e) => modifierCandidat(index, indexCandidat, e.target.value)}
                            placeholder={t("wizard.candidat_placeholder", { n: indexCandidat + 1 })}
                            className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                          />
                          {(option.candidats?.length ?? 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => supprimerCandidat(index, indexCandidat)}
                              className="shrink-0 rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => ajouterCandidat(index)}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
                      >
                        {t("wizard.ajouter_candidat")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-xs font-bold text-text-secondary">
                      {index + 1}
                    </span>
                    <input
                      value={option.label}
                      disabled={!optionsModifiables}
                      onChange={(e) => modifierOption(index, "label", e.target.value)}
                      placeholder={t("wizard.option_placeholder", { n: index + 1 })}
                      className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:bg-bg-tertiary disabled:opacity-70"
                    />
                    <input
                      value={option.description ?? ""}
                      disabled={!optionsModifiables}
                      onChange={(e) => modifierOption(index, "description", e.target.value)}
                      placeholder={t("wizard.option_description_placeholder")}
                      className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:bg-bg-tertiary disabled:opacity-70"
                    />
                    {optionsModifiables && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => supprimerOption(index)}
                        className="shrink-0 rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
            {optionsModifiables && (
              <button
                type="button"
                onClick={ajouterOption}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
              >
                + {t(modeCandidature === "liste" ? "wizard.ajouter_liste" : "wizard.ajouter_option")}
              </button>
            )}
            <p className="rounded-cid bg-status-infoBg px-3 py-2 text-[11px] text-status-infoText">
              {t("wizard.info_presentation")}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEtape(1)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("wizard.retour")}
              </button>
              <button
                type="button"
                onClick={allerEtape3}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
              >
                {t("wizard.suivant")}
              </button>
            </div>
          </div>
        )}

        {etape === 3 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase text-text-primary">
              {t("wizard.recap_titre")}
            </h2>
            <dl className="space-y-1.5 rounded-cid border border-text-tertiary/15 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.recap_titre_label")}</dt>
                <dd className="font-medium text-text-primary">{titre}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.type_vote")}</dt>
                <dd className="text-text-primary">{t(`wizard.type_${typeVote}`)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.duree")}</dt>
                <dd className="text-text-primary">{t(`wizard.duree_${dureeMinutes}`)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.confidentialite")}</dt>
                <dd className="text-text-primary">
                  {modeAnonymat === "anonyme" ? t("wizard.anonyme") : t("wizard.nominatif")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.recap_options")}</dt>
                <dd className="text-text-primary">{optionsValides.length}</dd>
              </div>
              {typeVote !== "oui_non" && (
                <div className="flex justify-between">
                  <dt className="text-text-secondary">{t("wizard.recap_mode_candidature")}</dt>
                  <dd className="text-text-primary">
                    {t(`wizard.mode_candidature_${modeCandidature}`)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("wizard.membres_eligibles")}</dt>
                <dd className="text-text-primary">
                  {eligibilite === "selection_manuelle"
                    ? t("wizard.membres_selectionnes_count", { count: membresSelectionnes.length })
                    : t(`wizard.eligibilite_${eligibilite}`)}
                </dd>
              </div>
            </dl>
            <p className="rounded-cid bg-status-warningBg px-3 py-2 text-[11px] text-status-warningText">
              ⚠ {t("wizard.avertissement_immuable")}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEtape(2)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("wizard.retour")}
              </button>
              <button
                type="button"
                onClick={lancerVote}
                disabled={creerMutation.isPending}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
              >
                {creerMutation.isPending ? t("wizard.lancement_en_cours") : t("wizard.lancer")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
