/**
 * Page "Fil d'actualité" (mockup #pg-fil, Release Plan §3.2 — Phase 4A).
 *
 * Publications texte/photo, hashtags (affichage seul — cliquer un hashtag filtre le fil),
 * likes/commentaires/partage (bascule), modération (masquer, Bureau Admin+). Un commentaire
 * peut recevoir une réponse (un seul niveau, voir CommentaireSerializer côté backend).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCommenterPublication,
  useCreerPublication,
  useLikerPublication,
  useMasquerCommentaire,
  useMasquerPublication,
  usePartagerPublication,
  usePublications,
  useSupprimerCommentaire,
  useSupprimerPublication,
} from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { Commentaire, Publication } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function initiales(auteur: { prenom: string; nom: string }): string {
  return `${auteur.prenom.charAt(0)}${auteur.nom.charAt(0)}`.toUpperCase();
}

function CommentaireLigne({
  commentaire,
  peutModerer,
  onRepondre,
}: {
  commentaire: Commentaire;
  peutModerer: boolean;
  onRepondre: (parentId: string) => void;
}) {
  const { t } = useTranslation("communaute");
  const supprimer = useSupprimerCommentaire();
  const masquer = useMasquerCommentaire();

  return (
    <div className="border-l-2 border-text-tertiary/20 pl-2">
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cal text-[9px] font-bold text-cad">
          {initiales(commentaire.auteur)}
        </div>
        <div className="flex-1 rounded-cid bg-bg-secondary px-2 py-1.5">
          <div className="text-xs font-bold text-text-primary">
            {commentaire.auteur.prenom} {commentaire.auteur.nom}
          </div>
          <p className="text-xs text-text-secondary">{commentaire.contenu}</p>
        </div>
      </div>
      <div className="ml-8 mt-0.5 flex gap-3 text-[10px] text-text-tertiary">
        <button
          type="button"
          onClick={() => onRepondre(commentaire.id)}
          className="hover:underline"
        >
          {t("fil.repondre")}
        </button>
        {commentaire.est_auteur && (
          <button
            type="button"
            onClick={() => supprimer.mutate(commentaire.id)}
            className="hover:underline"
          >
            {t("fil.supprimer")}
          </button>
        )}
        {peutModerer && !commentaire.est_auteur && (
          <button
            type="button"
            onClick={() => masquer.mutate(commentaire.id)}
            className="hover:underline"
          >
            {commentaire.est_masque ? t("fil.demasquer") : t("fil.masquer")}
          </button>
        )}
      </div>
      {commentaire.reponses.length > 0 && (
        <div className="ml-8 mt-1.5 space-y-1.5">
          {commentaire.reponses.map((reponse) => (
            <div key={reponse.id} className="flex items-start gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cal text-[8px] font-bold text-cad">
                {initiales(reponse.auteur)}
              </div>
              <div className="flex-1 rounded-cid bg-bg-secondary px-2 py-1">
                <div className="text-[11px] font-bold text-text-primary">
                  {reponse.auteur.prenom} {reponse.auteur.nom}
                </div>
                <p className="text-[11px] text-text-secondary">{reponse.contenu}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicationCarte({ publication }: { publication: Publication }) {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutModerer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const liker = useLikerPublication();
  const partager = usePartagerPublication();
  const supprimer = useSupprimerPublication();
  const masquer = useMasquerPublication();
  const commenter = useCommenterPublication();

  const [afficherCommentaires, setAfficherCommentaires] = useState(false);
  const [texteCommentaire, setTexteCommentaire] = useState("");
  const [repondreA, setRepondreA] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState("");

  function soumettreCommentaire(e: React.FormEvent) {
    e.preventDefault();
    if (!texteCommentaire.trim()) return;
    commenter.mutate(
      { publicationId: publication.id, contenu: texteCommentaire, parent: repondreA },
      {
        onSuccess: () => {
          setTexteCommentaire("");
          setRepondreA(undefined);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("fil.erreur_commentaire"))),
      },
    );
  }

  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ca text-xs font-bold text-white">
            {initiales(publication.auteur)}
          </div>
          <div>
            <div className="text-sm font-bold text-text-primary">
              {publication.auteur.prenom} {publication.auteur.nom}
            </div>
            <div className="text-[10px] text-text-tertiary">
              {formatDate(publication.created_at)}
            </div>
          </div>
        </div>
        {publication.est_masquee && (
          <span className="rounded bg-status-dangerBg px-1.5 py-0.5 text-[9px] font-bold text-status-dangerText">
            {t("fil.masquee_badge")}
          </span>
        )}
      </div>

      <p className="my-2 whitespace-pre-wrap text-sm text-text-secondary">{publication.contenu}</p>

      {publication.image && (
        <img
          src={publication.image}
          alt=""
          className="mb-2 max-h-80 w-full rounded-cid object-cover"
        />
      )}

      {publication.hashtags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {publication.hashtags.map((hashtag) => (
            <span key={hashtag} className="text-xs font-medium text-ca">
              #{hashtag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-text-tertiary/10 pt-2 text-xs text-text-tertiary">
        <button
          type="button"
          onClick={() => liker.mutate(publication.id)}
          className={`flex items-center gap-1 hover:text-ca ${publication.jaime ? "font-bold text-ca" : ""}`}
        >
          ♥ {publication.nombre_likes}
        </button>
        <button
          type="button"
          onClick={() => setAfficherCommentaires((v) => !v)}
          className="flex items-center gap-1 hover:text-ca"
        >
          💬 {publication.nombre_commentaires}
        </button>
        <button
          type="button"
          onClick={() => partager.mutate(publication.id)}
          className={`flex items-center gap-1 hover:text-ca ${publication.jai_partage ? "font-bold text-ca" : ""}`}
        >
          ↻ {publication.nombre_partages}
        </button>
        <div className="ml-auto flex gap-3">
          {publication.est_auteur && (
            <button
              type="button"
              onClick={() => supprimer.mutate(publication.id)}
              className="hover:underline"
            >
              {t("fil.supprimer")}
            </button>
          )}
          {peutModerer && !publication.est_auteur && (
            <button
              type="button"
              onClick={() => masquer.mutate({ id: publication.id, motif: "modération" })}
              className="hover:underline"
            >
              {publication.est_masquee ? t("fil.demasquer") : t("fil.masquer")}
            </button>
          )}
        </div>
      </div>

      {afficherCommentaires && (
        <div className="mt-3 space-y-2 border-t border-text-tertiary/10 pt-2">
          {publication.commentaires.map((commentaire) => (
            <CommentaireLigne
              key={commentaire.id}
              commentaire={commentaire}
              peutModerer={peutModerer}
              onRepondre={setRepondreA}
            />
          ))}

          <form onSubmit={soumettreCommentaire} className="flex gap-2">
            <input
              type="text"
              value={texteCommentaire}
              onChange={(e) => setTexteCommentaire(e.target.value)}
              placeholder={
                repondreA ? t("fil.placeholder_reponse") : t("fil.placeholder_commentaire")
              }
              className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
            >
              {t("fil.envoyer")}
            </button>
          </form>
          {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
        </div>
      )}
    </div>
  );
}

export default function FilPage() {
  const { t } = useTranslation("communaute");
  const [texte, setTexte] = useState("");
  const [image, setImage] = useState<File | undefined>(undefined);
  const [erreur, setErreur] = useState("");

  const publicationsQuery = usePublications();
  const creer = useCreerPublication();

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    creer.mutate(
      { contenu: texte, image },
      {
        onSuccess: () => {
          setTexte("");
          setImage(undefined);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("fil.erreur_publication"))),
      },
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("fil.titre")}</h1>

      <form
        onSubmit={soumettre}
        className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
        id="new-post-form"
      >
        <textarea
          id="new-post-txt"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={t("fil.placeholder_publication")}
          rows={3}
          className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <input
            type="file"
            accept="image/*"
            aria-label={t("fil.ajouter_photo")}
            onChange={(e) => setImage(e.target.files?.[0])}
            className="text-xs text-text-tertiary"
          />
          <button
            type="submit"
            disabled={creer.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("fil.publier")}
          </button>
        </div>
        {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
      </form>

      {publicationsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("fil.chargement")}</p>
      )}
      {publicationsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("fil.erreur_chargement")}</p>
      )}
      {publicationsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("fil.aucune_publication")}</p>
      )}

      <div className="space-y-3">
        {publicationsQuery.data?.results.map((publication) => (
          <PublicationCarte key={publication.id} publication={publication} />
        ))}
      </div>
    </div>
  );
}
