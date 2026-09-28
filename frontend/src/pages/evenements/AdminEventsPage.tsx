/**
 * Page "Événements — Administration" (mockup #pg-admin-events, FDD §2.2, Bureau Admin+).
 * Créer un événement (brouillon), le modifier, le publier (visible à tous, déclenche les
 * invitations — voir EvenementViewSet.publier/envoyer_invitations_evenement côté backend) ou
 * l'annuler. Pas de suppression : contrairement au mockup (bouton "Supprimer" décoratif),
 * EvenementViewSet n'expose pas DELETE (http_method_names = get/post/patch, voir views.py) —
 * "Annuler" est la seule façon réelle de retirer un événement, même principe que
 * l'annulation d'une session de vote plutôt qu'une suppression pure.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import RichTextEditor from "../../components/ui/RichTextEditor";
import {
  useAnnulerEvenement,
  useCreerEvenement,
  useEvenements,
  useModifierEvenement,
  usePublierEvenement,
  useTeleverserImageEvenement,
} from "../../hooks/useEvenements";
import { usePageAccess } from "../../hooks/useRbac";
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
  lieu_maps_url: "",
  places_max: null,
  gratuit: false,
  cout: "0.00",
  accompagnants_payants: false,
  prix_accompagnant_adulte: "0.00",
  prix_accompagnant_enfant: "0.00",
  age_limite_accompagnant_enfant: 12,
  visible_public: false,
};

function FormulaireEvenement({
  evenement,
  onTermine,
  modifiable,
}: {
  evenement: Evenement | null;
  onTermine: () => void;
  modifiable: boolean;
}) {
  const { t } = useTranslation(["evenements", "common"]);
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
          lieu_maps_url: evenement.lieu_maps_url,
          places_max: evenement.places_max,
          gratuit: evenement.gratuit,
          cout: evenement.cout,
          accompagnants_payants: evenement.accompagnants_payants,
          prix_accompagnant_adulte: evenement.prix_accompagnant_adulte,
          prix_accompagnant_enfant: evenement.prix_accompagnant_enfant,
          age_limite_accompagnant_enfant: evenement.age_limite_accompagnant_enfant,
          visible_public: evenement.visible_public,
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
        {/* Éditeur riche type Word (demande utilisateur du 2026-09-27, point 11.3 :
            "word-like text editor" pour la description des événements) — même composant
            TipTap que Projets & Actions/Mitgliedschaftskampagnen (RichTextEditor.tsx), plus
            de simple <textarea>. La description stocke donc désormais du HTML — voir
            docstring de Evenement.description et apps.evenements.tasks (strip_tags avant tout
            envoi d'email texte brut). */}
        <RichTextEditor
          value={valeurs.description}
          onChange={(html) => champ("description", html)}
          placeholder={t("admin.champ_description_placeholder") ?? ""}
          ariaLabel={t("admin.champ_description") ?? ""}
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

      {/* Lien Google Maps (demande utilisateur du 2026-09-27, point 11.2) — utilisé uniquement
          comme cible du lien cliquable "Ouvrir dans Google Maps" côté membre, la vignette
          d'aperçu étant générée depuis `lieu` ci-dessus (voir components/ui/MapsApercu.tsx). */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_lieu_maps_url")}
        </label>
        <input
          type="url"
          value={valeurs.lieu_maps_url ?? ""}
          onChange={(e) => champ("lieu_maps_url", e.target.value)}
          placeholder={t("admin.champ_lieu_maps_url_placeholder")}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      {/* Begleitpersonen (module "Veranstaltungsverwaltung", 2026-09-25) — indépendant de
          gratuit/cout ci-dessus : un événement gratuit pour le membre peut tout de même
          facturer ses accompagnants. */}
      <div className="rounded-cid border border-text-tertiary/20 p-3">
        <label
          htmlFor="admin-event-accompagnants-payants"
          className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary"
        >
          <input
            id="admin-event-accompagnants-payants"
            type="checkbox"
            checked={valeurs.accompagnants_payants ?? false}
            onChange={(e) => champ("accompagnants_payants", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-text-tertiary/40"
          />
          {t("admin.champ_accompagnants_payants")}
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="admin-event-prix-accompagnant-adulte"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("admin.champ_prix_accompagnant_adulte")}
            </label>
            <input
              id="admin-event-prix-accompagnant-adulte"
              type="number"
              min={0}
              step="0.01"
              disabled={!valeurs.accompagnants_payants}
              value={valeurs.prix_accompagnant_adulte ?? ""}
              onChange={(e) => champ("prix_accompagnant_adulte", e.target.value)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label
              htmlFor="admin-event-prix-accompagnant-enfant"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("admin.champ_prix_accompagnant_enfant")}
            </label>
            <input
              id="admin-event-prix-accompagnant-enfant"
              type="number"
              min={0}
              step="0.01"
              disabled={!valeurs.accompagnants_payants}
              value={valeurs.prix_accompagnant_enfant ?? ""}
              onChange={(e) => champ("prix_accompagnant_enfant", e.target.value)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label
              htmlFor="admin-event-age-limite-accompagnant-enfant"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("admin.champ_age_limite_accompagnant_enfant")}
            </label>
            <input
              id="admin-event-age-limite-accompagnant-enfant"
              type="number"
              min={1}
              value={valeurs.age_limite_accompagnant_enfant ?? 12}
              onChange={(e) =>
                champ("age_limite_accompagnant_enfant", Number(e.target.value) || 1)
              }
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {t("admin.aide_accompagnants")}
        </p>
      </div>

      {/* Startseite publique façon mycid.org/events (demande utilisateur 2026-09-26) — ne
          change jamais `statut` : un brouillon reste invisible même si cette case est cochée
          (voir EvenementViewSet.get_queryset côté backend). */}
      <label
        htmlFor="admin-event-visible-public"
        className="flex items-center gap-2 text-xs font-medium text-text-secondary"
      >
        <input
          id="admin-event-visible-public"
          type="checkbox"
          checked={valeurs.visible_public ?? false}
          onChange={(e) => champ("visible_public", e.target.checked)}
          className="h-3.5 w-3.5 rounded border-text-tertiary/40"
        />
        {t("admin.champ_visible_public")}
      </label>
      <p className="-mt-2 text-[11px] text-text-tertiary">{t("admin.aide_visible_public")}</p>

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
          disabled={enCours || !modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {evenement ? t("admin.enregistrer") : t("admin.creer_evenement")}
        </button>
      </div>
    </form>
  );
}

export default function AdminEventsPage() {
  const { t } = useTranslation(["evenements", "common"]);
  const evenementsQuery = useEvenements();
  const publier = usePublierEvenement();
  const annuler = useAnnulerEvenement();
  const televerserImageMutation = useTeleverserImageEvenement();
  const { accessible, modifiable } = usePageAccess("page_events");

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [evenementEnEdition, setEvenementEnEdition] = useState<Evenement | null>(null);
  const [erreurAction, setErreurAction] = useState("");
  // Téléversement de l'image de kachel (demande utilisateur 2026-09-27, point 11.1) — même
  // principe que GestionCatalogueTab.tsx (boutique) : bouton par ligne, ref map par id.
  //
  // Étape d'aperçu + confirmation ajoutée le 2026-09-28 (retour utilisateur : "Kein Button zur
  // Bestätigung des Hochladen des Bildes") — jusqu'ici le fichier choisi dans le sélecteur natif
  // partait immédiatement en upload sur `onChange`, sans aperçu ni bouton dédié : le clic "OK" de
  // la boîte de dialogue du système servait de seule confirmation, invisible pour l'utilisateur
  // une fois revenu sur la page. `imageEnAttente` retient maintenant le fichier choisi (+ une URL
  // d'aperçu via URL.createObjectURL) sans rien envoyer au serveur tant que l'utilisateur n'a pas
  // cliqué "Bestätigen" ci-dessous (confirmerImage) — "Abbrechen" annule sans upload.
  const [evenementImageEnCours, setEvenementImageEnCours] = useState<string | null>(null);
  const [evenementImageErreur, setEvenementImageErreur] = useState<{
    evenementId: string;
    message: string;
  } | null>(null);
  const [imageEnAttente, setImageEnAttente] = useState<{
    evenementId: string;
    fichier: File;
    previewUrl: string;
  } | null>(null);
  const inputsFichierImage = useRef<Record<string, HTMLInputElement | null>>({});

  function handleImageChoisie(evenement: Evenement, e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !modifiable) return;
    setEvenementImageErreur(null);
    setImageEnAttente((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.previewUrl);
      return { evenementId: evenement.id, fichier, previewUrl: URL.createObjectURL(fichier) };
    });
  }

  function annulerImageEnAttente() {
    setImageEnAttente((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.previewUrl);
      return null;
    });
  }

  function confirmerImageEnAttente() {
    if (!imageEnAttente) return;
    const { evenementId, fichier, previewUrl } = imageEnAttente;
    setEvenementImageEnCours(evenementId);
    setEvenementImageErreur(null);
    televerserImageMutation.mutate(
      { id: evenementId, fichier },
      {
        onError: (err) =>
          setEvenementImageErreur({
            evenementId,
            message: extractApiErrorMessage(err, t("admin.image_erreur")),
          }),
        onSettled: () => {
          setEvenementImageEnCours(null);
          URL.revokeObjectURL(previewUrl);
          setImageEnAttente(null);
        },
      },
    );
  }

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
            disabled={!modifiable}
            title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
            onClick={ouvrirCreation}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("admin.creer_evenement")}
          </button>
        )}
      </div>

      {accessible && !modifiable && (
        <p className="mb-4 rounded-cid-lg bg-status-warningBg px-3 py-2 text-xs text-status-warningText">
          {t("common:acces.lecture_seule_banniere")}
        </p>
      )}

      {afficherFormulaire && (
        <div className="mb-5">
          <FormulaireEvenement
            evenement={evenementEnEdition}
            onTermine={fermerFormulaire}
            modifiable={modifiable}
          />
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
              <div className="flex items-center gap-3">
                {/* Miniature de l'image actuelle (retour utilisateur du 2026-09-28) — permet de
                    vérifier qu'un envoi précédent a bien été pris en compte, sans devoir rouvrir
                    la Startseite publique pour le savoir. */}
                {evenement.image && (
                  <img
                    src={evenement.image}
                    alt=""
                    className="h-10 w-14 shrink-0 rounded-cid object-cover"
                  />
                )}
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
              </div>
              <div className="flex shrink-0 gap-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={(el) => {
                    inputsFichierImage.current[evenement.id] = el;
                  }}
                  onChange={(e) => handleImageChoisie(evenement, e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputsFichierImage.current[evenement.id]?.click()}
                  disabled={evenementImageEnCours === evenement.id || !modifiable}
                  title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                  className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
                >
                  {evenementImageEnCours === evenement.id
                    ? t("admin.image_en_cours")
                    : t("admin.image_televerser")}
                </button>
                <button
                  type="button"
                  disabled={!modifiable}
                  title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                  onClick={() => ouvrirEdition(evenement)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
                >
                  {t("admin.modifier")}
                </button>
                {evenement.statut === "brouillon" && (
                  <button
                    type="button"
                    disabled={!modifiable}
                    title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                    onClick={() => surPublier(evenement.id)}
                    className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                  >
                    {t("admin.publier")}
                  </button>
                )}
                {evenement.statut !== "annule" && (
                  <button
                    type="button"
                    disabled={!modifiable}
                    title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                    onClick={() => surAnnuler(evenement.id)}
                    className="rounded-cid px-3 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg disabled:opacity-40"
                  >
                    {t("admin.annuler_evenement")}
                  </button>
                )}
              </div>
            </div>
            {imageEnAttente?.evenementId === evenement.id && (
              <div className="mt-2 flex items-center gap-3 rounded-cid border border-text-tertiary/20 bg-bg-secondary p-2">
                <img
                  src={imageEnAttente.previewUrl}
                  alt={t("admin.image_apercu_alt") ?? ""}
                  className="h-12 w-16 shrink-0 rounded-cid object-cover"
                />
                <p className="flex-1 truncate text-xs text-text-secondary">
                  {imageEnAttente.fichier.name}
                </p>
                <button
                  type="button"
                  onClick={annulerImageEnAttente}
                  disabled={evenementImageEnCours === evenement.id}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                >
                  {t("admin.image_annuler")}
                </button>
                <button
                  type="button"
                  onClick={confirmerImageEnAttente}
                  disabled={evenementImageEnCours === evenement.id}
                  className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                >
                  {evenementImageEnCours === evenement.id
                    ? t("admin.image_en_cours")
                    : t("admin.image_confirmer")}
                </button>
              </div>
            )}
            {evenementImageErreur?.evenementId === evenement.id && (
              <p className="mt-2 text-xs text-status-dangerText">{evenementImageErreur.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
