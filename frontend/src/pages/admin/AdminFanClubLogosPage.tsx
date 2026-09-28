/**
 * Gestion des logos d'équipes du Fan-Club (retour utilisateur du 2026-09-28 : "Fan-Club:
 * Vereins-Logos anzeigen + Upload-Möglichkeit"). Réservée au Bureau Admin+ via `minRoleLevel`
 * (RequireRole, App.tsx), volontairement hors matrice apps.rbac — même choix que
 * /admin/configuration-site (voir docstring EquipeLogoPermission côté backend et le
 * commentaire sur ce nav item dans Sidebar.tsx).
 *
 * Formulaire "nom d'équipe + fichier" plutôt qu'un sélecteur parmi les équipes déjà
 * synchronisées (`ClassementLigue`/`RencontreCalendrier` n'ont pas de liste fixe de clubs —
 * texte libre synchronisé depuis GOAL API, voir docstring EquipeLogo côté backend) : l'admin
 * tape/colle le nom EXACT tel qu'il apparaît dans la Tabelle/le Spielplan. Un upload pour un
 * nom déjà présent dans la liste ci-dessous REMPLACE le logo existant (upsert, voir
 * EquipeLogoViewSet.create côté backend) — pas de formulaire d'édition séparé, retéléverser
 * suffit.
 */
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useEnregistrerEquipeLogo,
  useEquipesLogos,
  useSupprimerEquipeLogo,
} from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function AdminFanClubLogosPage() {
  const { t } = useTranslation("communaute");
  const { data: logos, isLoading, isError } = useEquipesLogos();
  const enregistrerMutation = useEnregistrerEquipeLogo();
  const supprimerMutation = useSupprimerEquipeLogo();
  const inputFichier = useRef<HTMLInputElement | null>(null);

  const [equipe, setEquipe] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function handleFichierChoisi(e: ChangeEvent<HTMLInputElement>) {
    setFichier(e.target.files?.[0] ?? null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!equipe.trim() || !fichier) return;
    setErreur(null);
    enregistrerMutation.mutate(
      { equipe: equipe.trim(), logo: fichier },
      {
        onSuccess: () => {
          setEquipe("");
          setFichier(null);
          if (inputFichier.current) inputFichier.current.value = "";
        },
        onError: (err) =>
          setErreur(extractApiErrorMessage(err, t("admin_fan_club_logos.erreur_enregistrement"))),
      },
    );
  }

  function handleSupprimer(id: number) {
    setErreur(null);
    supprimerMutation.mutate(id, {
      onError: (err) =>
        setErreur(extractApiErrorMessage(err, t("admin_fan_club_logos.erreur_suppression"))),
    });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">
        {t("admin_fan_club_logos.titre")}
      </h1>
      <p className="mb-4 text-sm text-text-secondary">
        {t("admin_fan_club_logos.description")}
      </p>

      {erreur && <p className="mb-3 text-sm text-status-dangerText">{erreur}</p>}

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="fan-club-logo-equipe"
            className="mb-1 block text-xs font-semibold text-text-tertiary"
          >
            {t("admin_fan_club_logos.champ_equipe")}
          </label>
          <input
            id="fan-club-logo-equipe"
            type="text"
            value={equipe}
            onChange={(e) => setEquipe(e.target.value)}
            placeholder={t("admin_fan_club_logos.champ_equipe_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="fan-club-logo-fichier"
            className="mb-1 block text-xs font-semibold text-text-tertiary"
          >
            {t("admin_fan_club_logos.champ_logo")}
          </label>
          <input
            id="fan-club-logo-fichier"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={inputFichier}
            onChange={handleFichierChoisi}
            className="w-full text-sm text-text-primary"
          />
        </div>
        <button
          type="submit"
          disabled={!equipe.trim() || !fichier || enregistrerMutation.isPending}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {enregistrerMutation.isPending
            ? t("admin_fan_club_logos.televersement_en_cours")
            : t("admin_fan_club_logos.televerser")}
        </button>
      </form>

      {isLoading && (
        <p className="text-sm text-text-tertiary">{t("admin_fan_club_logos.chargement")}</p>
      )}
      {isError && (
        <p className="text-sm text-status-dangerText">
          {t("admin_fan_club_logos.erreur_chargement")}
        </p>
      )}
      {logos && logos.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("admin_fan_club_logos.aucun_logo")}</p>
      )}

      {logos && logos.length > 0 && (
        <ul className="divide-y divide-text-tertiary/10 rounded-cid-lg bg-bg-primary shadow-sm">
          {logos.map((logo) => (
            <li key={logo.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <img
                  src={logo.logo}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-contain"
                />
                <span className="truncate text-sm font-medium text-text-primary">
                  {logo.equipe}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleSupprimer(logo.id)}
                disabled={supprimerMutation.isPending}
                className="shrink-0 rounded-cid px-3 py-1.5 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg disabled:opacity-50"
              >
                {t("admin_fan_club_logos.supprimer")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
