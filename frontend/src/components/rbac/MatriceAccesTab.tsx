/**
 * Onglet "Zugriff" — Modul Rollenverwaltung (Phase C, 2026-09-23). Matrice Rôle × Module :
 * colonnes dynamiques depuis `GET /rbac/matrix/` (`matrice.modules`, jamais une liste TS en dur —
 * l'ajout d'un module côté backend (registry.py) apparaît donc ici automatiquement, sans
 * changement frontend). Chaque cellule est un accès additionnel, complémentaire de la logique
 * ROLE_LEVELS existante (voir backend/apps/rbac/services.py::is_elevated_for_module) — modifier
 * la cellule d'un rôle système n'affecte jamais son propre comportement legacy (2FA, IsRHOrAbove…),
 * seulement les droits qu'un rôle ADDITIONNEL apporterait à un utilisateur qui le cumule.
 *
 * Libellés (demande utilisateur du 2026-09-23 : "Die Rollennamen sollen der eingestellten
 * Sprache entsprechend") : `role.nom`/`module.label` viennent du backend dans une seule langue
 * fixe (français, voir migrations/registry.py) — pour les 5 rôles système et les 10 modules
 * connus on affiche donc la traduction ("utilisateurs:role.<slug>", "rbac:modules.<slug>") avec
 * la valeur backend comme `defaultValue` (i18next), jamais le champ brut directement. Un rôle
 * personnalisé (is_system=false) n'a pas de clé de traduction — son nom, choisi librement par
 * l'admin, reste affiché tel quel dans toutes les langues, par nature.
 *
 * Mise en page (2026-10-12, point 4) : modules en lignes, deux cases "Lesen"/"Schreiben" par rôle,
 * comme l'onglet Sichtbarkeit — voir utils/niveauAcces.ts pour la correspondance avec les niveaux.
 *
 * Verrouillage Administrateur App (Phase D, ajouté le 2026-09-23) : pour les colonnes
 * `categorie === "page_admin"` (les 13 pages de gestion), les deux cases de "super_admin" sont
 * désactivées et forcées sur "lecture_ecriture" avec tooltip — reflète le bypass hardcodé
 * côté backend (rbac_services.has_admin_page_access ignore la matrice pour super_admin, voir
 * POST /rbac/matrix/set/ qui refuse aussi ce couple avec 400). Même motif que le bouton
 * Löschen désactivé pour is_system ci-dessous.
 */
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerRole,
  useRbacMatrice,
  useSetMatriceCellule,
  useSupprimerRole,
} from "../../hooks/useRbac";
import type { CategorieModule, ModuleInfo, NiveauAcces, RoleDefinition } from "../../types/rbac";
import { extractApiErrorMessage } from "../../utils/apiError";
import { niveauApresClic } from "../../utils/niveauAcces";

// Même mise en page que l'onglet "Sichtbarkeit" (demande utilisateur du 2026-10-12, point 4) :
// une ligne par module (regroupées par catégorie), deux cases à cocher par rôle — "Lesen" et
// "Schreiben" — à la place de l'ancienne liste déroulante. Le niveau backend reste inchangé
// (aucun / lecture / lecture_ecriture) : "Schreiben" suppose "Lesen" (cocher Schreiben coche
// aussi Lesen, décocher Lesen décoche aussi Schreiben).
const CATEGORIES: CategorieModule[] = ["donnees", "page_admin"];

export default function MatriceAccesTab() {
  const { t } = useTranslation(["rbac", "utilisateurs"]);

  const libelleRole = (role: RoleDefinition) =>
    role.is_system ? t(`utilisateurs:role.${role.slug}`, role.nom) : role.nom;
  const libelleModule = (module: ModuleInfo) => t(`modules.${module.slug}`, module.label);

  const { data: matrice, isLoading, isError } = useRbacMatrice();
  const setCelluleMutation = useSetMatriceCellule();
  const creerRoleMutation = useCreerRole();
  const supprimerRoleMutation = useSupprimerRole();

  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauSlug, setNouveauSlug] = useState("");
  const [nouvelleDescription, setNouvelleDescription] = useState("");
  const [erreurCreation, setErreurCreation] = useState<string | null>(null);
  const [succesCreation, setSuccesCreation] = useState<string | null>(null);
  const [erreursSuppression, setErreursSuppression] = useState<Record<string, string>>({});
  const [confirmationSuppression, setConfirmationSuppression] = useState<string | null>(null);

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-text-tertiary">{t("acces.chargement")}</p>;
  }
  if (isError || !matrice) {
    return (
      <p className="py-6 text-center text-sm text-status-dangerText">
        {t("acces.erreur_chargement")}
      </p>
    );
  }

  const celluleValeur = (roleId: string, module: string): NiveauAcces => {
    const cellule = matrice.cells.find((c) => c.role_id === roleId && c.module === module);
    return cellule?.niveau_acces ?? "aucun";
  };

  function changerCellule(roleId: string, module: string, niveau_acces: NiveauAcces) {
    setCelluleMutation.mutate({ role_id: roleId, module, niveau_acces });
  }

  function creerRole(e: React.FormEvent) {
    e.preventDefault();
    setErreurCreation(null);
    setSuccesCreation(null);
    creerRoleMutation.mutate(
      { slug: nouveauSlug.trim(), nom: nouveauNom.trim(), description: nouvelleDescription.trim() },
      {
        onSuccess: (role) => {
          setNouveauNom("");
          setNouveauSlug("");
          setNouvelleDescription("");
          setSuccesCreation(t("acces.nouveau_role.succes", { nom: role.nom }));
        },
        onError: (error) =>
          setErreurCreation(extractApiErrorMessage(error, t("acces.nouveau_role.erreur"))),
      },
    );
  }

  function supprimerRole(roleId: string) {
    setErreursSuppression((prev) => ({ ...prev, [roleId]: "" }));
    supprimerRoleMutation.mutate(roleId, {
      onSuccess: () => setConfirmationSuppression(null),
      onError: (error) =>
        setErreursSuppression((prev) => ({
          ...prev,
          [roleId]: extractApiErrorMessage(error, t("acces.supprimer.erreur")),
        })),
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-text-primary">{t("acces.titre")}</h2>
      <p className="mb-4 text-sm text-text-secondary">{t("acces.description")}</p>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-xs font-semibold uppercase text-text-tertiary">
              <th rowSpan={2} className="sticky left-0 bg-bg-primary px-4 py-2 text-left">
                {t("acces.col_module")}
              </th>
              {matrice.roles.map((role) => (
                <th
                  key={role.id}
                  colSpan={2}
                  className="border-l border-text-tertiary/10 px-3 py-2"
                >
                  <div className="flex flex-col items-center gap-1 normal-case">
                    <span className="font-semibold text-text-primary">{libelleRole(role)}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase ${
                        role.is_system ? "bg-bg-tertiary text-text-tertiary" : "bg-ca/10 text-ca"
                      }`}
                    >
                      {role.is_system ? t("acces.role_systeme") : t("acces.role_personnalise")}
                    </span>
                    {confirmationSuppression === role.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => supprimerRole(role.id)}
                          disabled={supprimerRoleMutation.isPending}
                          className="rounded-cid bg-status-dangerText px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                        >
                          {t("acces.supprimer.bouton")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmationSuppression(null)}
                          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary"
                        >
                          {t("attribution.annuler")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={role.is_system}
                        title={role.is_system ? (t("acces.supprimer.erreur_systeme") ?? "") : ""}
                        onClick={() => setConfirmationSuppression(role.id)}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-30"
                      >
                        {t("acces.supprimer.bouton")}
                      </button>
                    )}
                    {erreursSuppression[role.id] && (
                      <p className="max-w-[10rem] text-xs font-normal text-status-dangerText">
                        {erreursSuppression[role.id]}
                      </p>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="border-b border-text-tertiary/20 text-xs font-semibold uppercase text-text-tertiary">
              {matrice.roles.map((role) => (
                <Fragment key={role.id}>
                  <th className="border-l border-text-tertiary/10 px-3 py-1.5 text-center">
                    {t("acces.col_lecture")}
                  </th>
                  <th className="px-3 py-1.5 text-center">{t("acces.col_ecriture")}</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((categorie) => {
              const modules = matrice.modules.filter((m) => m.categorie === categorie);
              if (modules.length === 0) return null;
              return (
                <Fragment key={categorie}>
                  <tr className="bg-text-tertiary/5">
                    <th
                      colSpan={1 + matrice.roles.length * 2}
                      scope="colgroup"
                      className="px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
                    >
                      {t(`acces.groupes.${categorie}`)}
                    </th>
                  </tr>
                  {modules.map((module) => (
                    <tr
                      key={module.slug}
                      className="border-b border-text-tertiary/10 last:border-0"
                    >
                      <td className="sticky left-0 bg-bg-primary px-4 py-2 font-medium text-text-primary">
                        {libelleModule(module)}
                      </td>
                      {matrice.roles.map((role) => {
                        const verrouillee =
                          role.slug === "super_admin" && module.categorie === "page_admin";
                        const niveau: NiveauAcces = verrouillee
                          ? "lecture_ecriture"
                          : celluleValeur(role.id, module.slug);
                        const titre = verrouillee
                          ? (t("acces.cellule.verrouillee_super_admin") ?? "")
                          : "";
                        return (
                          <Fragment key={role.id}>
                            {(["lecture", "ecriture"] as const).map((champ, i) => (
                              <td
                                key={champ}
                                className={`px-3 py-2 text-center ${
                                  i === 0 ? "border-l border-text-tertiary/10" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={`${libelleRole(role)} — ${libelleModule(module)} (${t(
                                    `acces.col_${champ}`,
                                  )})`}
                                  title={titre}
                                  checked={
                                    champ === "lecture"
                                      ? niveau !== "aucun"
                                      : niveau === "lecture_ecriture"
                                  }
                                  disabled={verrouillee}
                                  onChange={(e) =>
                                    changerCellule(
                                      role.id,
                                      module.slug,
                                      niveauApresClic(niveau, champ, e.target.checked),
                                    )
                                  }
                                  className="disabled:opacity-40"
                                />
                              </td>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={creerRole}
        className="mt-5 max-w-lg rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          {t("acces.nouveau_role.titre")}
        </h3>
        {succesCreation && (
          <div className="mb-3 rounded-cid border border-status-successText/30 bg-status-successBg px-3 py-2 text-sm text-status-successText">
            {succesCreation}
          </div>
        )}
        {erreurCreation && (
          <div className="mb-3 rounded-cid border border-status-dangerText/30 bg-status-dangerBg px-3 py-2 text-sm text-status-dangerText">
            {erreurCreation}
          </div>
        )}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="rbac-nouveau-nom"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("acces.nouveau_role.nom_label")}
            </label>
            <input
              id="rbac-nouveau-nom"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder={t("acces.nouveau_role.nom_placeholder") ?? ""}
              required
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="rbac-nouveau-slug"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("acces.nouveau_role.slug_label")}
            </label>
            <input
              id="rbac-nouveau-slug"
              value={nouveauSlug}
              onChange={(e) => setNouveauSlug(e.target.value)}
              placeholder={t("acces.nouveau_role.slug_placeholder") ?? ""}
              required
              pattern="[a-z0-9-]+"
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="mb-3">
          <label
            htmlFor="rbac-nouvelle-description"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("acces.nouveau_role.description_label")}
          </label>
          <textarea
            id="rbac-nouvelle-description"
            value={nouvelleDescription}
            onChange={(e) => setNouvelleDescription(e.target.value)}
            placeholder={t("acces.nouveau_role.description_placeholder") ?? ""}
            rows={2}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creerRoleMutation.isPending}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("acces.nouveau_role.creer")}
        </button>
      </form>
    </div>
  );
}
