/**
 * Page "Projets & Actions — Administration" (Bureau Admin+, module ajouté le 2026-09-22 sur
 * demande utilisateur : "Modul für Projekte und Aktionen mit Verwaltung für Admin"). CRUD complet
 * du Projet lui-même (titre, texte riche, statut, cagnote/objectif, échéance, responsable, ordre
 * d'affichage, images de la kachel) — voir apps.projets.permissions docstring : le·la responsable
 * assigné gère seulement le CONTENU (images/rapport), jamais ces champs, donc cette page est
 * réservée au Bureau Admin+ (ProjetPermission côté backend refuse toute écriture ici à qui n'a
 * pas ce rôle, cette page n'est de toute façon jamais dans la navigation d'un rôle inférieur, voir
 * routing).
 *
 * Contrairement à ProjetsPage (page membre), useProjets() reçoit ici tous les statuts, y compris
 * "en_preparation" (masqué à un rôle < Bureau Admin, voir ProjetViewSet.get_queryset) — l'admin
 * doit pouvoir préparer un projet avant de le rendre visible.
 *
 * L'ajout de mise à jour du rapport d'avancement (point 7) réutilise RapportModal telle quelle :
 * un Bureau Admin+ est toujours `est_gestionnaire` (voir est_gestionnaire_projet côté backend),
 * le formulaire d'ajout y est donc déjà visible sans code supplémentaire ici.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import BildHinweis from "../../components/ui/BildHinweis";

import MembreSearchPicker from "../../components/membres/MembreSearchPicker";
import RapportModal from "../../components/projets/RapportModal";
import SichtbarkeitBadge from "../../components/projets/SichtbarkeitBadge";
import StatutProjetBadge from "../../components/projets/StatutProjetBadge";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import RichTextEditor from "../../components/ui/RichTextEditor";
import {
  useAjouterImageProjet,
  useCreerProjet,
  useModifierProjet,
  useProjets,
  useSupprimerImageProjet,
  useSupprimerProjet,
} from "../../hooks/useProjets";
import { usePageAccess } from "../../hooks/useRbac";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { MembreListItem } from "../../types/membre";
import type {
  MembreResumeProjet,
  Projet,
  ProjetPayload,
  SichtbarkeitProjet,
  StatutProjet,
} from "../../types/projets";

const STATUTS: StatutProjet[] = ["en_preparation", "en_cours", "termine", "annule"];
const SICHTBARKEITEN: SichtbarkeitProjet[] = ["entwurf", "veroeffentlicht"];

const FORMULAIRE_VIDE: ProjetPayload = {
  titre: "",
  description_html: "",
  statut: "en_preparation",
  sichtbarkeit: "entwurf",
  responsable: null,
  cagnote_active: false,
  objectif_montant: null,
  date_limite: null,
  ordre: 0,
};

function FormulaireProjet({
  projet,
  onTermine,
  modifiable,
}: {
  projet: Projet | null;
  onTermine: () => void;
  /** page_projets en lecture_ecriture (task #216) — gate UNIQUEMENT les champs du Projet
   * lui-même (titre/statut/cagnote_active/objectif_montant/date_limite/responsable/ordre, voir
   * ProjetPermission côté backend). Ne s'applique PAS à la gestion des images ci-dessous
   * (ajouterImage/supprimerImage) : celle-ci reste régie par GestionContenuProjetPermission/
   * est_gestionnaire_projet (Bureau Admin+ OU responsable assigné de CE projet), un mécanisme
   * volontairement distinct de la matrice page_projets — voir docstring de tête de module. */
  modifiable: boolean;
}) {
  const { t } = useTranslation(["projets", "common"]);
  const creer = useCreerProjet();
  const modifier = useModifierProjet();
  const ajouterImage = useAjouterImageProjet();
  const supprimerImage = useSupprimerImageProjet();

  const [valeurs, setValeurs] = useState<ProjetPayload>(
    projet
      ? {
          titre: projet.titre,
          description_html: projet.description_html,
          statut: projet.statut,
          sichtbarkeit: projet.sichtbarkeit,
          responsable: projet.responsable,
          cagnote_active: projet.cagnote_active,
          objectif_montant: projet.objectif_montant,
          date_limite: projet.date_limite,
          historisch_betrag: projet.historisch_betrag ?? "0.00",
          historisch_beitragende: projet.historisch_beitragende ?? 0,
          historisch_jahr: projet.historisch_jahr ?? null,
          ordre: projet.ordre,
        }
      : FORMULAIRE_VIDE,
  );
  const [responsableSelection, setResponsableSelection] = useState<
    MembreListItem | MembreResumeProjet | null
  >(projet?.responsable_detail ?? null);
  const [nouvellesImages, setNouvellesImages] = useState<File[]>([]);
  const [erreur, setErreur] = useState("");

  const enCours = creer.isPending || modifier.isPending;

  function champ<K extends keyof ProjetPayload>(cle: K, valeur: ProjetPayload[K]) {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!valeurs.titre.trim()) return;
    setErreur("");
    const payload: ProjetPayload = {
      ...valeurs,
      responsable: responsableSelection?.id ?? null,
      objectif_montant: valeurs.cagnote_active ? valeurs.objectif_montant : null,
      // Historie nur bei abgeschlossenem Projekt (sonst Backend-Validierung) — sonst zurücksetzen.
      historisch_betrag:
        valeurs.statut === "termine" ? valeurs.historisch_betrag || "0.00" : "0.00",
      historisch_beitragende:
        valeurs.statut === "termine" ? (valeurs.historisch_beitragende ?? 0) : 0,
      historisch_jahr: valeurs.statut === "termine" ? (valeurs.historisch_jahr ?? null) : null,
    };

    try {
      const resultat = projet
        ? await modifier.mutateAsync({ id: projet.id, payload })
        : await creer.mutateAsync(payload);
      // Les nouvelles images sélectionnées (création ET édition) sont envoyées séquentiellement
      // APRÈS l'enregistrement du Projet lui-même — même principe que RapportModal.publier,
      // puisqu'elles référencent son id (voir ProjetImagePayload).
      for (const fichier of nouvellesImages) {
        await ajouterImage.mutateAsync({ projet: resultat.id, image: fichier });
      }
      onTermine();
    } catch (err) {
      setErreur(extractApiErrorMessage(err, t("admin.erreur_enregistrement")));
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text-primary">
        {projet ? t("admin.modifier_projet") : t("admin.nouveau_projet")}
      </h2>
      <div>
        <label
          htmlFor="admin-projet-titre"
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          {t("admin.champ_titre")} <span className="text-status-dangerText">*</span>
        </label>
        <input
          id="admin-projet-titre"
          type="text"
          value={valeurs.titre}
          onChange={(e) => champ("titre", e.target.value)}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_description")}
        </label>
        <RichTextEditor
          value={valeurs.description_html ?? ""}
          onChange={(html) => champ("description_html", html)}
          ariaLabel={t("admin.champ_description") ?? ""}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="admin-projet-statut"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_statut")}
          </label>
          <select
            id="admin-projet-statut"
            value={valeurs.statut}
            onChange={(e) => champ("statut", e.target.value as StatutProjet)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            {STATUTS.map((statut) => (
              <option key={statut} value={statut}>
                {t(`statut.${statut}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="admin-projet-sichtbarkeit"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin.champ_sichtbarkeit")}
          </label>
          <select
            id="admin-projet-sichtbarkeit"
            value={valeurs.sichtbarkeit}
            onChange={(e) => champ("sichtbarkeit", e.target.value as SichtbarkeitProjet)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            {SICHTBARKEITEN.map((wert) => (
              <option key={wert} value={wert}>
                {t(`arbeitsbereich.sichtbarkeit.${wert}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("admin.champ_ordre")}
          </label>
          <input
            type="number"
            value={valeurs.ordre ?? 0}
            onChange={(e) => champ("ordre", Number(e.target.value))}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_responsable")}
        </label>
        <MembreSearchPicker
          selection={responsableSelection}
          onSelect={(m: MembreListItem | null) => setResponsableSelection(m)}
          placeholder={t("admin.aucun_responsable") ?? ""}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={valeurs.cagnote_active ?? false}
            onChange={(e) => champ("cagnote_active", e.target.checked)}
          />
          {t("admin.champ_cagnote_active")}
        </label>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("admin.champ_objectif")}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={!valeurs.cagnote_active}
            value={valeurs.objectif_montant ?? ""}
            onChange={(e) => champ("objectif_montant", e.target.value || null)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.champ_date_limite")}
        </label>
        <input
          type="date"
          value={valeurs.date_limite ?? ""}
          onChange={(e) => champ("date_limite", e.target.value || null)}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      {valeurs.statut === "termine" && (
        <fieldset className="rounded-cid border border-text-tertiary/20 p-3">
          <legend className="px-1 text-xs font-semibold text-text-primary">
            {t("admin.historie_titre")}
          </legend>
          <p className="mb-2 text-xs text-text-tertiary">{t("admin.historie_hinweis")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="admin-projet-hist-betrag"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("admin.historie_betrag")}
              </label>
              <input
                id="admin-projet-hist-betrag"
                type="number"
                min={0}
                step="0.01"
                value={valeurs.historisch_betrag ?? ""}
                onChange={(e) => champ("historisch_betrag", e.target.value)}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="admin-projet-hist-anzahl"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("admin.historie_beitragende")}
              </label>
              <input
                id="admin-projet-hist-anzahl"
                type="number"
                min={0}
                step={1}
                value={valeurs.historisch_beitragende ?? 0}
                onChange={(e) => champ("historisch_beitragende", Number(e.target.value))}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="admin-projet-hist-jahr"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("admin.historie_jahr")}
              </label>
              <input
                id="admin-projet-hist-jahr"
                type="number"
                min={2000}
                max={2100}
                value={valeurs.historisch_jahr ?? ""}
                onChange={(e) =>
                  champ("historisch_jahr", e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </fieldset>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin.images_titre")}
        </label>
        {projet && projet.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {projet.images.map((image) => (
              <div key={image.id} className="relative h-16 w-16 overflow-hidden rounded-cid">
                <img src={image.image} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => supprimerImage.mutate(image.id)}
                  aria-label={t("admin.supprimer") ?? ""}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-[10px] text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setNouvellesImages(Array.from(e.target.files ?? []))}
          className="block w-full text-xs text-text-secondary"
        />
        <BildHinweis variante="projekt" className="mt-1" />
      </div>

      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onTermine}
          className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
        >
          {t("common:action.annuler")}
        </button>
        <button
          type="submit"
          disabled={enCours || !modifiable}
          title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {projet ? t("admin.enregistrer") : t("admin.nouveau_projet")}
        </button>
      </div>
    </form>
  );
}

export default function AdminProjetsPage() {
  const { t } = useTranslation(["projets", "common"]);
  const projetsQuery = useProjets();
  const supprimer = useSupprimerProjet();
  const { accessible, modifiable } = usePageAccess("page_projets");

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [projetEnEdition, setProjetEnEdition] = useState<Projet | null>(null);
  const [projetRapport, setProjetRapport] = useState<Projet | null>(null);
  const [projetASupprimer, setProjetASupprimer] = useState<Projet | null>(null);
  const [erreurAction, setErreurAction] = useState("");

  function ouvrirCreation() {
    setProjetEnEdition(null);
    setAfficherFormulaire(true);
  }

  function ouvrirEdition(projet: Projet) {
    setProjetEnEdition(projet);
    setAfficherFormulaire(true);
  }

  function fermerFormulaire() {
    setAfficherFormulaire(false);
    setProjetEnEdition(null);
  }

  function confirmerSuppression() {
    if (!projetASupprimer) return;
    supprimer.mutate(projetASupprimer.id, {
      onError: (err) =>
        setErreurAction(extractApiErrorMessage(err, t("admin.erreur_enregistrement"))),
    });
    setProjetASupprimer(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("admin.titre")}</h1>
        {!afficherFormulaire && (
          <button
            type="button"
            disabled={!modifiable}
            title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
            onClick={ouvrirCreation}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("admin.nouveau_projet")}
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
          <FormulaireProjet
            projet={projetEnEdition}
            onTermine={fermerFormulaire}
            modifiable={modifiable}
          />
        </div>
      )}

      {erreurAction && <p className="mb-2 text-xs text-status-dangerText">{erreurAction}</p>}

      {projetsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("page.chargement")}</p>
      )}
      {projetsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("page.aucun_projet")}</p>
      )}

      <div className="space-y-2">
        {projetsQuery.data?.results.map((projet) => (
          <div key={projet.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-text-primary">
                    {projet.titre}
                  </span>
                  <StatutProjetBadge statut={projet.statut} />
                  <SichtbarkeitBadge sichtbarkeit={projet.sichtbarkeit} afficherPublie />
                </div>
                <div className="text-xs text-text-tertiary">
                  {projet.responsable_detail
                    ? `${projet.responsable_detail.prenom} ${projet.responsable_detail.nom}`
                    : t("admin.aucun_responsable")}
                  {" · "}
                  {projet.montant_collecte} € · {projet.nb_contributeurs}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setProjetRapport(projet)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
                >
                  {t("rapport.voir")}
                </button>
                <button
                  type="button"
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  onClick={() => ouvrirEdition(projet)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
                >
                  {t("admin.modifier")}
                </button>
                <button
                  type="button"
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  onClick={() => setProjetASupprimer(projet)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg disabled:opacity-40"
                >
                  {t("admin.supprimer")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {projetRapport && (
        <RapportModal
          projet={projetRapport}
          onClose={() => setProjetRapport(null)}
          // Seul module où l'ajout de mise à jour est proposé (Projektverwaltung) — voir
          // docstring RapportModal.
          autoriserAjout
        />
      )}

      <ConfirmDialog
        open={projetASupprimer !== null}
        title={t("admin.supprimer")}
        message={t("admin.confirmer_suppression")}
        danger
        onConfirm={confirmerSuppression}
        onCancel={() => setProjetASupprimer(null)}
      />
    </div>
  );
}
