/**
 * Vidéo de fond du hero de la page d'accueil publique (demande utilisateur du 2026-09-27,
 * Phase 5 "Startseite Hero-Video" : "ein video im hero bereich"). Réservée au Bureau Admin+ via
 * `minRoleLevel` (RequireRole, App.tsx), volontairement hors matrice apps.rbac — voir docstring
 * de ConfigurationSitePublicPermission côté backend et le commentaire sur ce nav item dans
 * Sidebar.tsx.
 *
 * Même structure que ParametresNotificationPage.tsx (GET/PATCH d'un singleton), mais avec un
 * upload de fichier (voir GalerieProduitManager.tsx pour le même motif input file caché +
 * bouton) plutôt que des interrupteurs.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useConfigurationSitePublic,
  useModifierConfigurationSitePublic,
} from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function AdminConfigurationSitePage() {
  const { t } = useTranslation("public");
  const { data, isLoading, isError } = useConfigurationSitePublic();
  const modifierMutation = useModifierConfigurationSitePublic();
  const inputFichier = useRef<HTMLInputElement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function handleFichierChoisi(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    modifierMutation.mutate(fichier, {
      onError: (err) => setErreur(extractApiErrorMessage(err, t("admin_hero_video.erreur"))),
    });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("admin_hero_video.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("admin_hero_video.description")}</p>

      {isLoading && (
        <p className="text-sm text-text-tertiary">{t("admin_hero_video.chargement")}</p>
      )}
      {isError && (
        <p className="text-sm text-status-dangerText">{t("admin_hero_video.erreur_chargement")}</p>
      )}
      {erreur && <p className="mb-3 text-sm text-status-dangerText">{erreur}</p>}

      {data && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          {data.video_hero ? (
            <video
              key={data.video_hero}
              src={data.video_hero}
              controls
              muted
              className="mb-4 max-h-64 w-full rounded-cid bg-black object-contain"
            />
          ) : (
            <p className="mb-4 text-sm text-text-tertiary">{t("admin_hero_video.aucune_video")}</p>
          )}

          <input
            type="file"
            accept="video/mp4"
            ref={inputFichier}
            onChange={handleFichierChoisi}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputFichier.current?.click()}
            disabled={modifierMutation.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {modifierMutation.isPending
              ? t("admin_hero_video.televersement_en_cours")
              : t("admin_hero_video.televerser")}
          </button>
        </div>
      )}
    </div>
  );
}
