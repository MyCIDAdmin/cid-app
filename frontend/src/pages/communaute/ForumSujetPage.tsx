/**
 * Page "Détail d'un sujet de forum" (mockup #pg-forum thread ouvert, Phase 4A), umgebaut zum
 * Chat-Verlauf (Forum A, 2026-11) : Antworten als Blasen mit Reaktionen, „↩ Antworten“ zitiert eine
 * frühere Antwort, Emoji im Antwortfeld, „Beste Antwort“ durch den Themenersteller (Bureau Admin+
 * darf auch). Moderation (épingler/verrouiller/masquer) bleibt Bureau Admin+ ; die Buttons sind
 * nur Komfort, das Backend entscheidet.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import ChatAvatar from "../../components/chats/ChatAvatar";
import EmojiAuswahl from "../../components/chats/EmojiAuswahl";
import ReaktionsLeiste from "../../components/communaute/ReaktionsLeiste";
import ShareButton from "../../components/ui/ShareButton";
import {
  useBesteAntwort,
  useEpinglerSujet,
  useMasquerReponseForum,
  useMasquerSujet,
  useReagieren,
  useRepondreAuSujet,
  useSujet,
  useSupprimerReponseForum,
  useSupprimerSujet,
  useVerrouillerSujet,
} from "../../hooks/useCommunaute";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { ReponseForum } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache, vorZeit } from "../../utils/datum";
import { markiereForumThemaGesehen } from "../../utils/forumGesehen";
import { KATEGORIE_FARBE } from "../../utils/forumKategorie";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(lokaleSprache());
}

function name(a: { prenom: string; nom: string }): string {
  return `${a.prenom} ${a.nom}`;
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
  const besteAntwort = useBesteAntwort();
  const reagierenSujet = useReagieren("sujets");
  const reagierenAntwort = useReagieren("reponses-forum");

  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState("");
  const [zitiert, setZitiert] = useState<ReponseForum | undefined>(undefined);
  const [emojiOffen, setEmojiOffen] = useState(false);
  // Mentions "@" (ajoutées le 2026-09-29) — déclaré avant les retours anticipés (Rules of Hooks).
  const mention = useMentionAutocomplete(contenu, setContenu);

  // Als gesehen merken (nur dieses Gerät) : beim Öffnen und beim Verlassen, damit die eigene
  // Antwort das Thema nicht wieder als „neu“ markiert.
  useEffect(() => {
    if (!id) return undefined;
    markiereForumThemaGesehen(user?.id, id);
    return () => markiereForumThemaGesehen(user?.id, id);
  }, [id, user?.id]);

  if (sujetQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("forum.chargement")}</p>;
  }
  if (sujetQuery.isError || !sujetQuery.data) {
    return <p className="text-sm text-status-dangerText">{t("forum.erreur_chargement")}</p>;
  }

  const sujet = sujetQuery.data;
  const darfBeste = sujet.est_auteur || peutModerer;

  function soumettreReponse(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim() || !id) return;
    repondre.mutate(
      {
        sujetId: id,
        contenu,
        mentions: mention.mentionsPourEnvoi(contenu),
        repondA: zitiert?.id,
      },
      {
        onSuccess: () => {
          setContenu("");
          setErreur("");
          setZitiert(undefined);
          setEmojiOffen(false);
          mention.reinitialiser();
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
          <div className="flex flex-wrap items-center gap-2">
            {sujet.est_epingle && <span title={t("forum.epingle")}>📌</span>}
            {sujet.est_verrouille && <span title={t("forum.verrouille")}>🔒</span>}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KATEGORIE_FARBE[sujet.categorie]}`}
            >
              {t(`categorie.${sujet.categorie}`)}
            </span>
            {sujet.beste_antwort && (
              <span className="rounded bg-status-successBg px-1.5 py-0.5 text-[10px] font-bold text-status-successText">
                {t("forum.geloest")} ✓
              </span>
            )}
          </div>
          {/* Partage externe (demande utilisateur du 2026-09-29) — voir docstring ShareButton. */}
          <ShareButton path={`/forum/${sujet.id}`} titre={sujet.titre} className="shrink-0" />
        </div>
        <h1 className="mt-1 text-lg font-bold text-text-primary">{sujet.titre}</h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
          <ChatAvatar name={name(sujet.auteur)} photo={sujet.auteur.photo} groesse="sm" />
          <span>
            {name(sujet.auteur)} · {formatDate(sujet.created_at)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{sujet.contenu}</p>

        <div className="mt-3">
          <ReaktionsLeiste
            reaktionen={sujet.reaktionen ?? []}
            onReagieren={(emoji) => reagierenSujet.mutate({ id: sujet.id, emoji })}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-3 border-t border-text-tertiary/10 pt-2 text-xs">
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

      <div className="space-y-4">
        {sujet.reponses.map((reponse) => {
          const eigen = reponse.est_auteur;
          const beste = reponse.ist_beste;
          return (
            <div
              key={reponse.id}
              id={`antwort-${reponse.id}`}
              className={`flex gap-2 ${eigen ? "flex-row-reverse" : ""}`}
            >
              <ChatAvatar name={name(reponse.auteur)} photo={reponse.auteur.photo} groesse="sm" />
              <div
                className={`flex min-w-0 max-w-[85%] flex-col ${eigen ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-cid-lg px-3 py-2 ${
                    eigen ? "bg-cal" : "bg-bg-primary shadow-sm"
                  } ${beste ? "ring-2 ring-status-successText/60" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-text-tertiary">
                    <b className="text-text-primary">{name(reponse.auteur)}</b>
                    {reponse.auteur.id === sujet.auteur.id && (
                      <span className="rounded bg-bg-secondary px-1 text-[10px]">
                        {t("forum.ersteller")}
                      </span>
                    )}
                    <span title={formatDate(reponse.created_at)}>
                      {vorZeit(reponse.created_at)}
                    </span>
                    {beste && (
                      <span className="font-bold text-status-successText">
                        {t("forum.beste_antwort_badge")} ✓
                      </span>
                    )}
                  </div>
                  {reponse.zitat && (
                    <a
                      href={`#antwort-${reponse.zitat.id}`}
                      className="mt-1 block rounded border-l-2 border-ca bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary"
                    >
                      <b>{name(reponse.zitat.auteur)}</b> {reponse.zitat.auszug}
                    </a>
                  )}
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-secondary">
                    {reponse.contenu}
                  </p>
                </div>
                <div className="mt-1">
                  <ReaktionsLeiste
                    klein
                    reaktionen={reponse.reaktionen ?? []}
                    onReagieren={(emoji) => reagierenAntwort.mutate({ id: reponse.id, emoji })}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-text-tertiary">
                  {!sujet.est_verrouille && (
                    <button
                      type="button"
                      onClick={() => setZitiert(reponse)}
                      className="font-medium hover:underline"
                    >
                      ↩ {t("forum.zitieren")}
                    </button>
                  )}
                  {darfBeste && !eigen && (
                    <button
                      type="button"
                      onClick={() =>
                        id &&
                        besteAntwort.mutate({ sujetId: id, reponseId: beste ? null : reponse.id })
                      }
                      className="font-medium hover:underline"
                    >
                      {beste
                        ? t("forum.beste_antwort_loesen")
                        : `✓ ${t("forum.beste_antwort_waehlen")}`}
                    </button>
                  )}
                  {eigen && (
                    <button
                      type="button"
                      onClick={() => id && supprimerReponse.mutate({ id: reponse.id, sujetId: id })}
                      className="hover:underline"
                    >
                      {t("forum.supprimer_reponse")}
                    </button>
                  )}
                  {peutModerer && !eigen && (
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
            </div>
          );
        })}
      </div>

      {sujet.est_verrouille ? (
        <p className="mt-3 text-xs text-text-tertiary">{t("forum.sujet_verrouille_message")}</p>
      ) : (
        <form onSubmit={soumettreReponse} className="relative mt-4">
          {zitiert && (
            <div className="mb-1 flex items-start gap-2 rounded-cid border-l-2 border-ca bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary">
              <span className="min-w-0 flex-1 truncate">
                <b>{t("forum.antwort_auf", { name: name(zitiert.auteur) })}</b> {zitiert.contenu}
              </span>
              <button
                type="button"
                aria-label={t("forum.zitat_abbrechen")}
                onClick={() => setZitiert(undefined)}
                className="shrink-0 font-bold hover:text-ca"
              >
                ✕
              </button>
            </div>
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
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder={t("forum.placeholder_reponse")}
              aria-label={t("forum.antwort_aria")}
              className="min-w-0 flex-1 rounded-full border border-text-tertiary/30 bg-bg-primary px-4 py-2 text-sm"
            />
            <button
              type="button"
              aria-label={t("chats.emoji")}
              aria-expanded={emojiOffen}
              onClick={() => setEmojiOffen((v) => !v)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg hover:bg-bg-secondary"
            >
              ☺
            </button>
            <button
              type="submit"
              disabled={repondre.isPending}
              className="rounded-full bg-ca px-5 py-2 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("forum.repondre")}
            </button>
          </div>
          {emojiOffen && (
            <div className="mt-1 overflow-hidden rounded-cid-lg border border-text-tertiary/20">
              <EmojiAuswahl onWaehle={(emoji) => setContenu((v) => v + emoji)} />
            </div>
          )}
        </form>
      )}
      {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
