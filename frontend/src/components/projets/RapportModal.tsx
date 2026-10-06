/**
 * Modale "Rapport d'avancement" (demande utilisateur point 7 : "Es muss möglich sein einen
 * Bericht (Mit Bildern) zum Projekt / Aktion mit updates zu 'Was getan wurde' hinzuzufügen") —
 * réservée depuis le 2026-09-26 à AdminProjetsPage (Gestion des projets) : côté page membre,
 * ProjetCard.onVoirRapport navigue désormais vers /projets/:id (pages/projets/ProjetDetailPage.tsx)
 * plutôt que d'ouvrir cette modale (demande utilisateur : porter la structure/le comportement de
 * https://www.mycid.org/projects, où "View Project" ouvre une page dédiée, jamais une superposition
 * — voir docstring ProjetDetailPage). Le rendu de la liste des mises à jour lui-même (lecture seule)
 * est partagé avec ProjetDetailPage via RapportListe — cette modale n'en garde que le conteneur et,
 * seulement si `autoriserAjout` ET que le `projet.est_gestionnaire` renvoyé par le serveur sont
 * tous les deux vrais, le formulaire d'ajout : titre, texte riche (RichTextEditor, même éditeur que
 * la description du projet), photos. Les images sont uploadées séparément APRÈS la création de la
 * mise à jour elle-même (elle a besoin d'un id à référencer — voir ProjetMiseAJourImagePayload),
 * une par une via useAjouterImageMiseAJourProjet, jamais dans le même appel JSON.
 *
 * `autoriserAjout` (ajouté le 2026-09-22, retour utilisateur) : `projet.est_gestionnaire` est
 * vrai pour tout Bureau Admin+ quel que soit l'écran (voir docstring AdminProjetsPage), donc ce
 * champ seul ne suffit PAS à distinguer "je suis dans /admin/projets (Projektverwaltung)" de "je
 * suis ailleurs" — c'est à l'appelant de dire explicitement s'il est le contexte de gestion,
 * jamais déduit du rôle de l'utilisateur. Depuis que cette modale n'est plus utilisée que par
 * AdminProjetsPage, `autoriserAjout` y est toujours `true` en pratique, mais le paramètre reste
 * explicite (sans valeur par défaut) plutôt que supprimé : ProjetDetailPage prouve, en important
 * RapportListe plutôt que cette modale, qu'un contexte de consultation ne peut structurellement
 * PAS afficher le formulaire d'ajout — bien plus sûr qu'un booléen qu'il faudrait se souvenir de
 * passer à `false`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import BildHinweis from "../ui/BildHinweis";

import {
  useAjouterImageMiseAJourProjet,
  useCreerMiseAJourProjet,
  useMisesAJourProjet,
} from "../../hooks/useProjets";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Projet } from "../../types/projets";
import RichTextEditor from "../ui/RichTextEditor";
import RapportListe from "./RapportListe";

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

        <div className="flex-1 overflow-y-auto p-4">
          <RapportListe
            misesAJour={misesAJourQuery.data?.results}
            chargement={misesAJourQuery.isLoading}
          />
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
              <BildHinweis variante="projekt" className="mt-1" />
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
