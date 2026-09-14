/**
 * Page "Événements — Administration" (mockup #pg-admin-events, FDD §2.2, Bureau Admin+).
 * Créer un événement (brouillon), le modifier, le publier (visible à tous, déclenche les
 * invitations — voir EvenementViewSet.publier/envoyer_invitations_evenement côté backend) ou
 * l'annuler. Pas de suppression : contrairement au mockup (bouton "Supprimer" décoratif),
 * EvenementViewSet n'expose pas DELETE (http_method_names = get/post/patch, voir views.py) —
 * "Annuler" est la seule façon réelle de retirer un événement, même principe que
 * l'annulation d'une session de vote plutôt qu'une suppression pure.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAnnulerEvenement,
  useCreerEvenement,
  useEvenements,
  useModifierEvenement,
  usePublierEvenement,
} from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Evenement, EvenementPayload, TypeEvenement } from "../../types/evenements";

const TYPES: TypeEvenement[] = ["deplacement", "fete", "conference", "tournoi", "ag"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const FORMULAIRE_VIDE: EvenementPayload = {
  titre: "",
  type_evenement: "deplacement",
  description: "",
  date_evenement: "",
  heure: "",
  lieu: "",
  point_rdv: "",
  places_max: null,
  gratuit: false,
  cout: "0.00",
};

function FormulaireEvenement({
  evenement,
  onTermine,
}: {
  evenement: Evenement | null;
  onTermine: () => void;
}) {
  const { t } = useTranslation("evenements");
  const creer = useCreerEvenement();
  const modifier = useModifierEvenement();
  const [valeurs, setValeurs] = useState<EvenementPayload>(
    evenement
      ? {
          titre: evenement.titre,
          type_evenement: evenement.type_evenement,
          description: evenement.description,
          date_evenement: evenement.date_evenement,
          heure: evenement.heure ?? "",
          lieu: evenement.lieu,
          point_rdv: evenement.point_rdv,
          places_max: evenement.places_max,
          gratuit: evenement.gratuit,
          cout: evenement.cout,
        }
      : FORMULAIRE_VIDE,
  );
  const [erreur, setErreur] = useState("");

  const enCours = creer.isPending || modifier.isPending;

  function champ<K extends keyof EvenementPayload>(cle: K, valeur: EvenementPayload[K]) {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (
      !valeurs.titre.trim() ||
      !valeurs.description.trim() ||
      !valeurs.date_evenement ||
      !valeurs.lieu.trim()
    ) {
      return;
    }
    const payload: EvenementPayload = { ...valeurs, heure: valeurs.heure || null };
    const surErreur = (err: unknown) =>
      setErreur(extractApiErrorMessage(err, t("admin.erreur_enregistrement")));

    if (evenement) {
      modifier.mutate({ id: evenement.id, payload }, { onSuccess: onTermine, onError: surErreur });
    } else {
      creer.mutate(payload, { onSuccess: onTermine, onError: surErreur });
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("admin.champ_titre")} <span className="text-status-dangerText">*</span>
          </label>
          <input
            type="text"
            value={valeurs.titre}
            onChange={(e) => champ("titre", e.target.value)}
            placeholder={t("admin.champ_titre_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="admin-event-type"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_type")}
          </label>
          <select
            id="admin-event-type"
            value={valeurs.type_evenement}
            onChange={(e) => champ("type_evenement", e.target.value as TypeEvenement)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type.${type}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_description")} <span className="text-status-dangerText">*</span>
        </label>
        <textarea
          value={valeurs.description}
          onChange={(e) => champ("description", e.target.value)}
          placeholder={t("admin.champ_description_placeholder")}
          rows={3}
          className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="admin-event-date"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_date")} <span className="text-status-dangerText">*</span>
          </label>
          <input
            id="admin-event-date"
            type="date"
            value={valeurs.date_evenement}
            onChange={(e) => champ("date_evenement", e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="admin-event-heure"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_heure")}
          </label>
          <input
            id="admin-event-heure"
            type="time"
            value={valeurs.heure ?? ""}
            onChange={(e) => champ("heure", e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_lieu")} <span className="text-status-dangerText">*</span>
        </label>
        <input
          type="text"
          value={valeurs.lieu}
          onChange={(e) => champ("lieu", e.target.value)}
          placeholder={t("admin.champ_lieu_placeholder")}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("admin.champ_places_max")}
          </label>
          <input
            type="number"
            min={1}
            value={valeurs.places_max ?? ""}
            onChange={(e) => champ("places_max", e.target.value ? Number(e.target.value) : null)}
            placeholder={t("admin.champ_places_max_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("admin.champ_cout")}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={valeurs.gratuit}
            value={valeurs.cout ?? ""}
            onChange={(e) => champ("cout", e.target.value)}
            placeholder="35"
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="admin-event-gratuit"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_gratuit")}
          </label>
          <select
            id="admin-event-gratuit"
            value={valeurs.gratuit ? "oui" : "non"}
            onChange={(e) => champ("gratuit", e.target.value === "oui")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="non">{t("admin.non")}</option>
            <option value="oui">{t("admin.oui")}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_point_rdv")}
        </label>
        <input
          type="text"
          value={valeurs.point_rdv}
          onChange={(e) => champ("point_rdv", e.target.value)}
          placeholder={t("admin.champ_point_rdv_placeholder")}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onTermine}
          className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
        >
          {t("admin.annuler_formulaire")}
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {evenement ? t("admin.enregistrer") : t("admin.creer_evenement")}
        </button>
      </div>
    </form>
  );
}

export default function AdminEventsPage() {
  const { t } = useTranslation("evenements");
  const evenementsQuery = useEvenements();
  const publier = usePublierEvenement();
  const annuler = useAnnulerEvenement();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [evenementEnEdition, setEvenementEnEdition] = useState<Evenement | null>(null);
  const [erreurAction, setErreurAction] = useState("");

  function ouvrirCreation() {
    setEvenementEnEdition(null);
    setAfficherFormulaire(true);
  }

  function ouvrirEdition(evenement: Evenement) {
    setEvenementEnEdition(evenement);
    setAfficherFormulaire(true);
  }

  function fermerFormulaire() {
    setAfficherFormulaire(false);
    setEvenementEnEdition(null);
  }

  function surPublier(id: string) {
    publier.mutate(id, {
      onError: (err) => setErreurAction(extractApiErrorMessage(err, t("admin.erreur_publication"))),
    });
  }

  function surAnnuler(id: string) {
    annuler.mutate(id, {
      onError: (err) => setErreurAction(extractApiErrorMessage(err, t("admin.erreur_annulation"))),
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("admin.titre")}</h1>
        {!afficherFormulaire && (
          <button
            type="button"
            onClick={ouvrirCreation}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("admin.creer_evenement")}
          </button>
        )}
      </div>

      {afficherFormulaire && (
        <div className="mb-5">
          <FormulaireEvenement evenement={evenementEnEdition} onTermine={fermerFormulaire} />
        </div>
      )}

      {erreurAction && <p className="mb-2 text-xs text-status-dangerText">{erreurAction}</p>}

      {evenementsQuery.isLoading && <p className="text-sm text-text-tertiary">{t("chargement")}</p>}
      {evenementsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>
      )}
      {evenementsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("aucun_evenement")}</p>
      )}

      <div className="space-y-2">
        {evenementsQuery.data?.results.map((evenement) => (
          <div key={evenement.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{evenement.titre}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      evenement.statut === "publie"
                        ? "bg-status-successBg text-status-successText"
                        : evenement.statut === "annule"
                          ? "bg-status-dangerBg text-status-dangerText"
                          : "bg-status-warningBg text-status-warningText"
                    }`}
                  >
                    {t(`statut.${evenement.statut}`)}
                  </span>
                </div>
                <div className="text-xs text-text-tertiary">
                  {formatDate(evenement.date_evenement)} · {evenement.lieu} ·{" "}
                  {t("places_sur_max", {
                    reservees: evenement.places_reservees,
                    max: evenement.places_max ?? "∞",
                  })}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => ouvrirEdition(evenement)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
                >
                  {t("admin.modifier")}
                </button>
                {evenement.statut === "brouillon" && (
                  <button
                    type="button"
                    onClick={() => surPublier(evenement.id)}
                    className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
                  >
                    {t("admin.publier")}
                  </button>
                )}
                {evenement.statut !== "annule" && (
                  <button
                    type="button"
                    onClick={() => surAnnuler(evenement.id)}
                    className="rounded-cid px-3 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg"
                  >
                    {t("admin.annuler_evenement")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
