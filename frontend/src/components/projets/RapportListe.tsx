import { useTranslation } from "react-i18next";

import type { ProjetMiseAJour } from "../../types/projets";
import ImageCarousel from "./ImageCarousel";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

interface RapportListeProps {
  misesAJour: ProjetMiseAJour[] | undefined;
  chargement: boolean;
}

/**
 * Rendu (lecture seule) de la liste des mises à jour du rapport d'avancement — extrait de
 * RapportModal le 2026-09-26 (demande utilisateur : porter la structure/le comportement de
 * https://www.mycid.org/projects sur /projets, "Voir le rapport" ouvrant désormais une PAGE dédiée
 * — pages/projets/ProjetDetailPage.tsx — plutôt qu'une modale côté page membre) afin que
 * RapportModal (toujours utilisée telle quelle par AdminProjetsPage, formulaire d'ajout inclus) et
 * ProjetDetailPage partagent EXACTEMENT le même rendu de la liste plutôt que de le dupliquer.
 */
export default function RapportListe({ misesAJour, chargement }: RapportListeProps) {
  const { t } = useTranslation("projets");

  return (
    <div className="space-y-4">
      {chargement && <p className="text-sm text-text-tertiary">{t("rapport.chargement")}</p>}
      {!chargement && misesAJour?.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("rapport.aucune_mise_a_jour")}</p>
      )}
      {misesAJour?.map((maj) => (
        <article key={maj.id} className="space-y-2 rounded-cid border border-text-tertiary/20 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{maj.titre}</h3>
            <span className="shrink-0 text-xs text-text-tertiary">{formatDate(maj.created_at)}</span>
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
  );
}
