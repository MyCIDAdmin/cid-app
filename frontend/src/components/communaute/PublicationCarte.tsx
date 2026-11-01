/**
 * Eine Neuigkeit im Feed (Neuigkeiten A, 2026-11) : Avatar und Zeit, Inhalt, Reaktionsleiste statt
 * Herz, Kommentar-Vorschau mit Emoji im Antwortfeld. Wichtige Beiträge tragen einen Rahmen und ein
 * Abzeichen. Löschen/Ausblenden liegen im „⋯“-Menü statt als Textlinks neben den Zählern.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCommenterPublication,
  useMasquerCommentaire,
  useMasquerPublication,
  usePartagerPublication,
  useReagieren,
  useSupprimerCommentaire,
  useSupprimerPublication,
} from "../../hooks/useCommunaute";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { Commentaire, Publication } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import { vorZeit } from "../../utils/datum";
import { apercuTexteDepuisHtml } from "../../utils/html";
import { bereinigeHtml } from "../../utils/sicheresHtml";
import ChatAvatar from "../chats/ChatAvatar";
import EmojiAuswahl from "../chats/EmojiAuswahl";
import ShareButton from "../ui/ShareButton";
import ReaktionsLeiste from "./ReaktionsLeiste";

function vollerName(auteur: { prenom: string; nom: string }): string {
  return `${auteur.prenom} ${auteur.nom}`;
}

function KommentarBlase({
  kommentar,
  peutModerer,
  onAntworten,
  antwort = false,
}: {
  kommentar: Commentaire;
  peutModerer: boolean;
  onAntworten?: (parentId: string) => void;
  antwort?: boolean;
}) {
  const { t } = useTranslation("communaute");
  const supprimer = useSupprimerCommentaire();
  const masquer = useMasquerCommentaire();
  const reagieren = useReagieren("commentaires");

  return (
    <div className="flex items-start gap-2">
      <ChatAvatar name={vollerName(kommentar.auteur)} photo={kommentar.auteur.photo} groesse="sm" />
      <div className="min-w-0 flex-1">
        <div className="rounded-cid bg-bg-secondary px-2.5 py-1.5">
          <div className="text-xs font-bold text-text-primary">{vollerName(kommentar.auteur)}</div>
          <p className="whitespace-pre-wrap break-words text-xs text-text-secondary">
            {kommentar.contenu}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
          <span>{vorZeit(kommentar.created_at)}</span>
          {!antwort && onAntworten && (
            <button
              type="button"
              onClick={() => onAntworten(kommentar.id)}
              className="font-medium hover:underline"
            >
              {t("fil.repondre")}
            </button>
          )}
          {kommentar.est_auteur && (
            <button
              type="button"
              onClick={() => supprimer.mutate(kommentar.id)}
              className="hover:underline"
            >
              {t("fil.supprimer")}
            </button>
          )}
          {peutModerer && !kommentar.est_auteur && (
            <button
              type="button"
              onClick={() => masquer.mutate(kommentar.id)}
              className="hover:underline"
            >
              {kommentar.est_masque ? t("fil.demasquer") : t("fil.masquer")}
            </button>
          )}
          <ReaktionsLeiste
            klein
            reaktionen={kommentar.reaktionen ?? []}
            onReagieren={(emoji) => reagieren.mutate({ id: kommentar.id, emoji })}
          />
        </div>
        {!antwort && kommentar.reponses.length > 0 && (
          <div className="mt-2 space-y-2">
            {kommentar.reponses.map((reponse) => (
              <KommentarBlase
                key={reponse.id}
                kommentar={reponse}
                peutModerer={peutModerer}
                antwort
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublicationCarte({
  publication,
  cardRef,
  onHashtagClick,
}: {
  publication: Publication;
  cardRef?: (el: HTMLElement | null) => void;
  onHashtagClick: (hashtag: string) => void;
}) {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutModerer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const reagieren = useReagieren("publications");
  const partager = usePartagerPublication();
  const supprimer = useSupprimerPublication();
  const masquer = useMasquerPublication();
  const commenter = useCommenterPublication();

  const [afficherCommentaires, setAfficherCommentaires] = useState(false);
  const [menuOffen, setMenuOffen] = useState(false);
  const [emojiOffen, setEmojiOffen] = useState(false);
  const [texteCommentaire, setTexteCommentaire] = useState("");
  const [repondreA, setRepondreA] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState("");
  // Mentions "@" (ajoutées le 2026-09-29) — voir hooks/useMentionAutocomplete.ts.
  const mention = useMentionAutocomplete(texteCommentaire, setTexteCommentaire);

  const kommentare = publication.commentaires;
  const letzter = kommentare.length > 0 ? kommentare[kommentare.length - 1] : undefined;
  const darfLoeschen = publication.est_auteur || peutModerer;

  function soumettreCommentaire(e: React.FormEvent) {
    e.preventDefault();
    if (!texteCommentaire.trim()) return;
    commenter.mutate(
      {
        publicationId: publication.id,
        contenu: texteCommentaire,
        parent: repondreA,
        mentions: mention.mentionsPourEnvoi(texteCommentaire),
      },
      {
        onSuccess: () => {
          setTexteCommentaire("");
          setRepondreA(undefined);
          setEmojiOffen(false);
          setErreur("");
          mention.reinitialiser();
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("fil.erreur_commentaire"))),
      },
    );
  }

  return (
    <article
      ref={cardRef}
      className={`rounded-cid-lg bg-bg-primary p-3 shadow-sm ${
        publication.important ? "ring-2 ring-ca/60" : ""
      }`}
    >
      {publication.important && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="rounded bg-ca px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {t("fil.important_badge")}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ChatAvatar
            name={vollerName(publication.auteur)}
            photo={publication.auteur.photo}
            groesse="sm"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-text-primary">
              {vollerName(publication.auteur)}
            </div>
            <div className="text-[11px] text-text-tertiary">{vorZeit(publication.created_at)}</div>
          </div>
        </div>
        <div className="relative flex items-center gap-1">
          {publication.est_masquee && (
            <span className="rounded bg-status-dangerBg px-1.5 py-0.5 text-[9px] font-bold text-status-dangerText">
              {t("fil.masquee_badge")}
            </span>
          )}
          {/* Partage externe (réseaux sociaux) — voir docstring ShareButton. */}
          <ShareButton
            path={`/fil?publication=${publication.id}`}
            titre={vollerName(publication.auteur)}
            texte={apercuTexteDepuisHtml(publication.contenu)}
          />
          {(darfLoeschen || peutModerer) && (
            <>
              <button
                type="button"
                aria-label={t("fil.mehr")}
                aria-expanded={menuOffen}
                onClick={() => setMenuOffen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-tertiary hover:bg-bg-secondary"
              >
                ⋯
              </button>
              {menuOffen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-cid-lg border border-text-tertiary/20 bg-bg-primary py-1 shadow-xl"
                >
                  {darfLoeschen && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOffen(false);
                        supprimer.mutate(publication.id);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary"
                    >
                      {t("fil.supprimer")}
                    </button>
                  )}
                  {peutModerer && !publication.est_auteur && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOffen(false);
                        masquer.mutate({ id: publication.id, motif: "modération" });
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary"
                    >
                      {publication.est_masquee ? t("fil.demasquer") : t("fil.masquer")}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* contenu est du HTML depuis le 2026-09-29 (éditeur riche) — rendu après nettoyage, jamais
          retapé côté client ; ShareButton ci-dessus utilise le texte brut tronqué. */}
      <div
        className="prose prose-sm my-2 max-w-none text-text-secondary [&_span[data-type='mention']]:font-semibold [&_span[data-type='mention']]:text-ca"
        dangerouslySetInnerHTML={{ __html: bereinigeHtml(publication.contenu) }}
      />

      {publication.image && (
        <img
          src={publication.image}
          alt=""
          className="mb-2 max-h-80 w-full rounded-cid object-cover"
        />
      )}

      {publication.document && (
        <a
          href={publication.document}
          target="_blank"
          rel="noreferrer"
          className="mb-2 flex items-center gap-2 rounded-cid bg-bg-secondary px-3 py-2 text-xs font-medium text-ca hover:underline"
        >
          📄 {t("fil.voir_document")}
        </a>
      )}

      {publication.hashtags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {publication.hashtags.map((hashtag) => (
            <button
              key={hashtag}
              type="button"
              onClick={() => onHashtagClick(hashtag)}
              className="text-xs font-medium text-ca hover:underline"
            >
              #{hashtag}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-text-tertiary/10 pt-2">
        <ReaktionsLeiste
          reaktionen={publication.reaktionen ?? []}
          onReagieren={(emoji) => reagieren.mutate({ id: publication.id, emoji })}
        />
        <div className="mt-2 flex items-center gap-4 text-xs text-text-tertiary">
          <button
            type="button"
            onClick={() => setAfficherCommentaires((v) => !v)}
            aria-expanded={afficherCommentaires}
            className="flex items-center gap-1 font-medium hover:text-ca"
          >
            💬 {t("fil.nombre_commentaires", { count: publication.nombre_commentaires })}
          </button>
          <button
            type="button"
            onClick={() => partager.mutate(publication.id)}
            aria-pressed={publication.jai_partage}
            className={`flex items-center gap-1 hover:text-ca ${publication.jai_partage ? "font-bold text-ca" : ""}`}
          >
            ↻ {t("fil.partager")} {publication.nombre_partages > 0 && publication.nombre_partages}
          </button>
        </div>
      </div>

      {!afficherCommentaires && letzter && (
        <button
          type="button"
          onClick={() => setAfficherCommentaires(true)}
          className="mt-2 block w-full rounded-cid bg-bg-secondary px-2.5 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary"
          data-testid="kommentar-vorschau"
        >
          <span className="font-bold text-text-primary">{vollerName(letzter.auteur)}</span>{" "}
          <span className="line-clamp-1">{letzter.contenu}</span>
          {publication.nombre_commentaires > 1 && (
            <span className="mt-0.5 block text-[11px] font-medium text-ca">
              {t("fil.alle_kommentare", { count: publication.nombre_commentaires })}
            </span>
          )}
        </button>
      )}

      {afficherCommentaires && (
        <div className="mt-3 space-y-3 border-t border-text-tertiary/10 pt-3">
          {kommentare.map((kommentar) => (
            <KommentarBlase
              key={kommentar.id}
              kommentar={kommentar}
              peutModerer={peutModerer}
              onAntworten={setRepondreA}
            />
          ))}

          <form onSubmit={soumettreCommentaire} className="relative">
            {repondreA && (
              <p className="mb-1 flex items-center gap-2 text-[11px] text-text-tertiary">
                {t("fil.placeholder_reponse")}
                <button
                  type="button"
                  onClick={() => setRepondreA(undefined)}
                  className="font-medium text-ca hover:underline"
                >
                  {t("fil.abbrechen")}
                </button>
              </p>
            )}
            {mention.suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-48 rounded-cid-lg bg-bg-primary py-1 shadow-xl">
                {mention.suggestions.map((auteur) => (
                  <button
                    key={auteur.id}
                    type="button"
                    onClick={() => mention.choisirMention(auteur)}
                    className="block w-full px-3 py-1 text-left text-xs hover:bg-bg-tertiary"
                  >
                    {auteur.prenom} {auteur.nom}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={texteCommentaire}
                onChange={(e) => setTexteCommentaire(e.target.value)}
                placeholder={
                  repondreA ? t("fil.placeholder_reponse") : t("fil.placeholder_commentaire")
                }
                aria-label={t("fil.placeholder_commentaire")}
                className="min-w-0 flex-1 rounded-full border border-text-tertiary/30 bg-bg-primary px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                aria-label={t("chats.emoji")}
                aria-expanded={emojiOffen}
                onClick={() => setEmojiOffen((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base hover:bg-bg-secondary"
              >
                ☺
              </button>
              <button
                type="submit"
                disabled={commenter.isPending}
                className="rounded-full bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("fil.envoyer")}
              </button>
            </div>
            {emojiOffen && (
              <div className="mt-1 overflow-hidden rounded-cid-lg border border-text-tertiary/20">
                <EmojiAuswahl onWaehle={(emoji) => setTexteCommentaire((v) => v + emoji)} />
              </div>
            )}
          </form>
          {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
        </div>
      )}
    </article>
  );
}
