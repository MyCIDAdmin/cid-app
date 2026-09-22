/**
 * Modale "Rapport d'avancement" (demande utilisateur point 7 : "Es muss möglich sein einen
 * Bericht (Mit Bildern) zum Projekt / Aktion mit updates zu 'Was getan wurde' hinzuzufügen") —
 * ouverte depuis ProjetCard.onVoirRapport, jamais depuis le retournement de la kachel (voir sa
 * docstring). Liste les ProjetMiseAJour du projet (les plus récentes en premier, voir
 * MisesAJourCursorPagination côté backend) et, seulement si `autoriserAjout` ET que le
 * `projet.est_gestionnaire` renvoyé par le serveur sont tous les deux vrais, propose un
 * formulaire d'ajout : titre, texte riche (RichTextEditor, même éditeur que la description du
 * projet), photos. Les images sont uploadées séparément APRÈS la création de la mise à jour
 * elle-même (elle a besoin d'un id à référencer — voir ProjetMiseAJourImagePayload), une par une
 * via useAjouterImageMiseAJourProjet, jamais dans le même appel JSON.
 *
 * `autoriserAjout` (ajouté le 2026-09-22, retour utilisateur) : `projet.est_gestionnaire` est
 * vrai pour tout Bureau Admin+ quel que soit l'écran (voir docstring AdminProjetsPage), donc ce
 * champ seul ne suffit PAS à distinguer "je suis dans /admin/projets (Projektverwaltung)" de "je
 * suis sur la page membre Projekte & Aktionen" — un Bureau Admin+ consultant ses PROPRES
 * projets côté membre voyait donc, à tort, le formulaire d'ajout de mise à jour là où il ne doit
 * servir qu'à la consultation. C'est à l'appelant (la page) de dire explicitement s'il est le
 * contexte de gestion (AdminProjetsPage) ou de simple consultation (ProjetsPage) — jamais déduit
 * du rôle de l'utilisateur.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAjouterImageMiseAJourProjet,
  useCreerMiseAJourProjet,
  useMisesAJourProjet,
} from "../../hooks/useProjets";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Projet } from "../../types/projets";
import RichTextEditor from "../ui/RichTextEditor";
import ImageCarousel from "./ImageCarousel";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

interface RapportModalProps {
  projet: Projet;
  onClose: () => void;
  /** true uniquement depuis /admin/projets (Projektverwaltung) — voir docstring plus haut.
   * Volontairement sans valeur par défaut : chaque appelant doit trancher explicitement plutôt
   * que de se reposer, à tort, sur `projet.est_gestionnaire` seul. */
  autoriserAjout: boolean;
}

export default function RapportModal({ projet, onClose, autoriserAjout }: RapportModalProps) {
  const { t } = useTranslation("projets");
  const misesAJourQuery = useMisesAJourProjet(projet.id);
  const creerMiseAJour = useCreerMiseAJourProjet();
  const ajouterImage = useAjouterImageMiseAJourProjet();

  const [titre, setTitre] = useState("");
  const [contenuHtml, setContenuHtml] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function publier() {
    setErreur("");
    setEnEnvoi(true);
    try {
      const maj = await creerMiseAJour.mutateAsync({
        projet: projet.id,
        titre,
        contenu_html: contenuHtml,
      });
      // Envoyées séquentiellement (jamais en parallèle) : un échec sur une image ne doit pas
      // masquer les autres derrière des erreurs concurrentes difficiles à rattacher côté UI.
      for (const fichier of fichiers) {
        await ajouterImage.mutateAsync({ mise_a_jour: maj.id, image: fichier });
      }
      setTitre("");
      setContenuHtml("");
      setFichiers([]);
    } catch (err) {
      setErreur(extractApiErrorMessage(err, t("modal_contribution.erreur")));
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-cid-lg bg-bg-primary shadow-lg">
        <div className="flex items-center justify-between border-b border-text-tertiary/20 p-4">
          <h2 className="text-base font-bold text-text-primary">
            {t("rapport.titre")} — {projet.titre}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {misesAJourQuery.isLoading && (
            <p className="text-sm text-text-tertiary">{t("rapport.chargement")}</p>
          )}
          {!misesAJourQuery.isLoading && misesAJourQuery.data?.results.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("rapport.aucune_mise_a_jour")}</p>
          )}
          {misesAJourQuery.data?.results.map((maj) => (
            <article
              key={maj.id}
              className="space-y-2 rounded-cid border border-text-tertiary/20 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{maj.titre}</h3>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {formatDate(maj.created_at)}
                </span>
              </div>
              {maj.images.length > 0 && (
                <ImageCarousel images={maj.images} titre={maj.titre} className="h-40" />
              )}
              <div
                className="prose prose-sm max-w-none text-text-primary"
                dangerouslySetInnerHTML={{ __html: maj.contenu_html }}
              />
              {maj.created_by_detail && (
                <p className="text-xs text-text-tertiary">
                  {maj.created_by_detail.prenom} {maj.created_by_detail.nom}
                </p>
              )}
            </article>
          ))}
        </div>

        {autoriserAjout && projet.est_gestionnaire && (
          <div className="space-y-2 border-t border-text-tertiary/20 p-4">
            <h3 className="text-sm font-semibold text-text-primary">{t("rapport.ajouter")}</h3>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder={t("rapport.titre_placeholder") ?? ""}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <RichTextEditor
              value={contenuHtml}
              onChange={setContenuHtml}
              placeholder={t("rapport.contenu_placeholder") ?? ""}
              ariaLabel={t("rapport.contenu_placeholder") ?? ""}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("rapport.ajouter_photos")}
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFichiers(Array.from(e.target.files ?? []))}
                className="block w-full text-xs text-text-secondary"
              />
            </div>
            {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={publier}
                disabled={enEnvoi || !titre || !contenuHtml}
                className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("rapport.publier")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
