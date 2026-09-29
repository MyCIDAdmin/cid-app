/**
 * Page "Détail d'un sujet de forum" (mockup #pg-forum thread ouvert, Phase 4A).
 *
 * Réponses, formulaire de réponse (bloqué si `est_verrouille`), actions de modération
 * (épingler/verrouiller/masquer) réservées Bureau Admin+ (voir ContenuCommunautePermission
 * côté backend — ces boutons restent affichés uniquement à titre de confort, le backend
 * reste seul juge en cas d'appel direct à l'API).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import {
  useEpinglerSujet,
  useMasquerReponseForum,
  useMasquerSujet,
  useRepondreAuSujet,
  useSujet,
  useSupprimerReponseForum,
  useSupprimerSujet,
  useVerrouillerSujet,
} from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function ForumSujetPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const peutModerer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const sujetQuery = useSujet(id ?? "");
  const epingler = useEpinglerSujet();
  const verrouiller = useVerrouillerSujet();
  const masquerSujet = useMasquerSujet();
  const supprimerSujet = useSupprimerSujet();
  const repondre = useRepondreAuSujet();
  const supprimerReponse = useSupprimerReponseForum();
  const masquerReponse = useMasquerReponseForum();

  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState("");

  if (sujetQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("forum.chargement")}</p>;
  }
  if (sujetQuery.isError || !sujetQuery.data) {
    return <p className="text-sm text-status-dangerText">{t("forum.erreur_chargement")}</p>;
  }

  const sujet = sujetQuery.data;

  function soumettreReponse(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim() || !id) return;
    repondre.mutate(
      { sujetId: id, contenu },
      {
        onSuccess: () => {
          setContenu("");
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("forum.erreur_reponse"))),
      },
    );
  }

  function handleSupprimerSujet() {
    if (!id) return;
    supprimerSujet.mutate(id, { onSuccess: () => navigate("/forum") });
  }

  return (
    <div>
      <Link to="/forum" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("forum.retour_liste")}
      </Link>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {sujet.est_epingle && <span title={t("forum.epingle")}>📌</span>}
            {sujet.est_verrouille && <span title={t("forum.verrouille")}>🔒</span>}
            <span className="rounded bg-cal px-1.5 py-0.5 text-[10px] font-medium text-cad">
              {t(`categorie.${sujet.categorie}`)}
            </span>
          </div>
          {/* Partage externe (demande utilisateur du 2026-09-29, module "Forum" : "Es soll
              möglich sein Elemente in Social Media zu teilen") — même composant que
              Fil/Projets/Boutique/Events, voir docstring ShareButton. */}
          <ShareButton path={`/forum/${sujet.id}`} titre={sujet.titre} className="shrink-0" />
        </div>
        <h1 className="mt-1 text-lg font-bold text-text-primary">{sujet.titre}</h1>
        <div className="mt-0.5 text-xs text-text-tertiary">
          {sujet.auteur.prenom} {sujet.auteur.nom} · {formatDate(sujet.created_at)}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{sujet.contenu}</p>

        <div className="mt-3 flex gap-3 border-t border-text-tertiary/10 pt-2 text-xs">
          {sujet.est_auteur && (
            <button type="button" onClick={handleSupprimerSujet} className="hover:underline">
              {t("forum.supprimer_sujet")}
            </button>
          )}
          {peutModerer && (
            <>
              <button
                type="button"
                onClick={() => id && epingler.mutate(id)}
                className="hover:underline"
              >
                {sujet.est_epingle ? t("forum.desepingler") : t("forum.epingler")}
              </button>
              <button
                type="button"
                onClick={() => id && verrouiller.mutate(id)}
                className="hover:underline"
              >
                {sujet.est_verrouille ? t("forum.deverrouiller") : t("forum.verrouiller")}
              </button>
              <button
                type="button"
                onClick={() => id && masquerSujet.mutate({ id, motif: "modération" })}
                className="hover:underline"
              >
                {sujet.est_masque ? t("forum.demasquer") : t("forum.masquer")}
              </button>
            </>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-4 text-sm font-bold text-text-primary">
        {t("forum.nombre_reponses", { count: sujet.nombre_reponses })}
      </h2>

      <div className="space-y-2">
        {sujet.reponses.map((reponse) => (
          <div key={reponse.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="text-xs font-bold text-text-primary">
              {reponse.auteur.prenom} {reponse.auteur.nom}
            </div>
            <div className="text-[10px] text-text-tertiary">{formatDate(reponse.created_at)}</div>
            <p className="mt-1 text-sm text-text-secondary">{reponse.contenu}</p>
            <div className="mt-1 flex gap-3 text-[10px] text-text-tertiary">
              {reponse.est_auteur && (
                <button
                  type="button"
                  onClick={() => id && supprimerReponse.mutate({ id: reponse.id, sujetId: id })}
                  className="hover:underline"
                >
                  {t("forum.supprimer_reponse")}
                </button>
              )}
              {peutModerer && !reponse.est_auteur && (
                <button
                  type="button"
                  onClick={() => id && masquerReponse.mutate({ id: reponse.id, sujetId: id })}
                  className="hover:underline"
                >
                  {reponse.est_masquee ? t("forum.demasquer") : t("forum.masquer")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {sujet.est_verrouille ? (
        <p className="mt-3 text-xs text-text-tertiary">{t("forum.sujet_verrouille_message")}</p>
      ) : (
        <form onSubmit={soumettreReponse} className="mt-3 flex gap-2">
          <input
            type="text"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder={t("forum.placeholder_reponse")}
            className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={repondre.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("forum.repondre")}
          </button>
        </form>
      )}
      {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
