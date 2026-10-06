/**
 * Fiche membre (mockup #pg-admin-fiche-membre). Lecture ouverte à tout
 * authentifié (le backend scope déjà le queryset) ; les actions de gestion
 * (changer le statut, supprimer) restent gated RH+/Bureau Admin ici en plus
 * du contrôle serveur, pour ne pas afficher des boutons inopérants. Le lien
 * "modifier" est aussi proposé au Membre sur sa propre fiche (AHM-51) — le
 * formulaire cible (MembreFormPage) lui masque ensuite les champs
 * administratifs.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatutBadge from "../../components/ui/StatutBadge";
import { useChangerStatutMembre, useDeleteMembre, useMembre } from "../../hooks/useMembres";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { PAYS_ALLEMAGNE, STATUTS_MEMBRE } from "../../types/membre";
import type { StatutMembre } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

function Champ({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-primary">{valeur || "—"}</dd>
    </div>
  );
}

export default function MembreDetailPage() {
  const { t } = useTranslation("membres");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const peutGerer = hasRoleAtLeast(user, ROLE_LEVELS.rh);
  const peutSupprimer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const { data: membre, isLoading, isError } = useMembre(id);
  const peutModifier = peutGerer || (Boolean(membre) && membre?.user === user?.id);
  const changerStatutMutation = useChangerStatutMembre(id ?? "");
  const deleteMutation = useDeleteMembre();

  const [nouveauStatut, setNouveauStatut] = useState<StatutMembre | "">("");
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [erreurStatut, setErreurStatut] = useState<string | null>(null);

  function appliquerChangementStatut() {
    if (!nouveauStatut) return;
    setErreurStatut(null);
    changerStatutMutation.mutate(nouveauStatut, {
      onSuccess: () => setNouveauStatut(""),
      onError: (error) => setErreurStatut(extractApiErrorMessage(error, t("fiche.erreur_statut"))),
    });
  }

  function supprimer() {
    if (!id) return;
    deleteMutation.mutate(id, { onSuccess: () => navigate("/membres", { replace: true }) });
  }

  if (isLoading) {
    return <p className="text-text-tertiary">{t("liste.chargement")}</p>;
  }

  if (isError || !membre) {
    return <p className="text-status-dangerText">{t("fiche.erreur_chargement")}</p>;
  }

  return (
    <div>
      <Link to="/membres" className="mb-4 inline-block text-sm text-text-secondary hover:underline">
        ← {t("fiche.retour")}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cal text-lg font-semibold text-ca">
            {initiales(membre.prenom, membre.nom)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {membre.prenom} {membre.nom}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-text-tertiary">
              <span>{membre.numero_membre}</span>
              <StatutBadge statut={membre.statut} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {peutModifier && (
            <Link
              to={`/membres/${membre.id}/modifier`}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
            >
              {t("fiche.modifier")}
            </Link>
          )}
          {peutSupprimer && (
            <button
              type="button"
              onClick={() => setConfirmerSuppression(true)}
              className="rounded-cid border border-status-dangerText/30 px-3 py-1.5 text-sm text-status-dangerText hover:bg-status-dangerBg"
            >
              {t("fiche.supprimer")}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("fiche.section_personnelles")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Champ label={t("champ.prenom")} valeur={membre.prenom} />
            <Champ label={t("champ.nom")} valeur={membre.nom} />
            <Champ label={t("champ.date_naissance")} valeur={membre.date_naissance} />
            <Champ label={t("champ.sexe")} valeur={t(`sexe.${membre.sexe}`)} />
            <Champ label={t("champ.email")} valeur={membre.email} />
            <Champ label={t("champ.telephone")} valeur={membre.telephone} />
            <Champ label={t("champ.cin")} valeur={membre.cin} />
            <Champ label={t("champ.passeport")} valeur={membre.passeport} />
          </dl>
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("fiche.section_adresse")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Champ label={t("champ.pays")} valeur={t(`pays.${membre.pays}`)} />
            {membre.pays === PAYS_ALLEMAGNE && (
              <>
                <Champ label={t("champ.adresse_de")} valeur={membre.adresse_de} />
                <Champ label={t("champ.code_postal_de")} valeur={membre.code_postal_de} />
                <Champ label={t("champ.ville_de")} valeur={membre.ville_de} />
                <Champ label={t("champ.land_de")} valeur={membre.land_de} />
              </>
            )}
            <Champ label={t("champ.ville_origine_tn")} valeur={membre.ville_origine_tn} />
            <Champ label={t("champ.gouvernorat_tn")} valeur={membre.gouvernorat_tn} />
          </dl>
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("fiche.section_associatives")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-4">
            <Champ label={t("champ.numero_membre")} valeur={membre.numero_membre} />
            <Champ label={t("champ.date_adhesion")} valeur={membre.date_adhesion} />
            <div>
              <dt className="text-xs font-medium uppercase text-text-tertiary">
                {t("champ.statut")}
              </dt>
              <dd className="mt-0.5">
                <StatutBadge statut={membre.statut} />
              </dd>
            </div>
          </dl>

          {peutGerer && (
            <div className="mt-5 border-t border-text-tertiary/10 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                {t("fiche.changer_statut_titre")}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={nouveauStatut}
                  onChange={(e) => setNouveauStatut(e.target.value as StatutMembre | "")}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  <option value="">{t("fiche.choisir_statut")}</option>
                  {STATUTS_MEMBRE.filter((s) => s.value !== membre.statut).map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!nouveauStatut || changerStatutMutation.isPending}
                  onClick={appliquerChangementStatut}
                  className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                >
                  {t("fiche.appliquer")}
                </button>
                {erreurStatut && <p className="text-sm text-status-dangerText">{erreurStatut}</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmerSuppression}
        title={t("fiche.confirmer_suppression_titre")}
        message={t("fiche.confirmer_suppression_message", {
          nom: `${membre.prenom} ${membre.nom}`,
        })}
        danger
        onConfirm={supprimer}
        onCancel={() => setConfirmerSuppression(false)}
      />
    </div>
  );
}
