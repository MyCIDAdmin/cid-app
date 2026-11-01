/**
 * Page "Forum" (mockup #pg-forum, Release Plan §3.2 — 4 catégories fixes, Phase 4A), umgebaut zur
 * aktiven Themenliste (Forum A, 2026-11) : Suche, Sortierung (Aktivste, Neueste, Beliebteste,
 * Unbeantwortet), farbige Kategorie-Chips, angeheftete Themen oben, Punkt „neu für dich“ (nur pro
 * Gerät, siehe utils/forumGesehen), Zeile „Letzte Aktivität“, Zähler für Antworten und Reaktionen.
 * Das Thema selbst (Antworten, Moderation) lebt in ForumSujetPage.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { SujetSortierung } from "../../api/communaute";
import ChatAvatar from "../../components/chats/ChatAvatar";
import ShareButton from "../../components/ui/ShareButton";
import { useCreerSujet, useSujets } from "../../hooks/useCommunaute";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import { useAuthStore } from "../../store/authStore";
import type { CategorieForum } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import { vorZeit } from "../../utils/datum";
import { KATEGORIE_FARBE } from "../../utils/forumKategorie";
import { forumGesehen, forumGrundlinie, istForumThemaNeu } from "../../utils/forumGesehen";

const CATEGORIES: CategorieForum[] = ["football_ca", "vie_en_allemagne", "emploi", "general"];

type Reiter = "aktiv" | "neu" | "beliebt" | "unbeantwortet";
const REITER: Reiter[] = ["aktiv", "neu", "beliebt", "unbeantwortet"];

export default function ForumPage() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const [categorie, setCategorie] = useState<CategorieForum | "">("");
  const [reiter, setReiter] = useState<Reiter>("aktiv");
  const [suche, setSuche] = useState("");
  const [sucheWirksam, setSucheWirksam] = useState("");
  const [afficherForm, setAfficherForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [categorieForm, setCategorieForm] = useState<CategorieForum>("general");
  const [erreur, setErreur] = useState("");

  // Eingabe erst nach einer kurzen Pause an den Server geben.
  useEffect(() => {
    const timer = window.setTimeout(() => setSucheWirksam(suche.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [suche]);

  const sortierung: SujetSortierung =
    reiter === "neu" ? "neu" : reiter === "beliebt" ? "beliebt" : "aktiv";
  const sujetsQuery = useSujets({
    categorie: categorie || undefined,
    suche: sucheWirksam || undefined,
    sortierung,
    unbeantwortet: reiter === "unbeantwortet" ? true : undefined,
  });
  const creer = useCreerSujet();
  // Mentions "@" (ajoutées le 2026-09-29) — voir hooks/useMentionAutocomplete.ts.
  const mention = useMentionAutocomplete(contenu, setContenu);

  // „Neu für dich“ : Gerätewissen, einmal beim Öffnen gelesen.
  const grundlinie = useMemo(() => forumGrundlinie(user?.id), [user?.id]);
  const gesehen = useMemo(() => forumGesehen(user?.id), [user?.id]);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim() || !contenu.trim()) {
      setErreur(t("forum.erreur_champs_requis"));
      return;
    }
    creer.mutate(
      { categorie: categorieForm, titre, contenu, mentions: mention.mentionsPourEnvoi(contenu) },
      {
        onSuccess: () => {
          setTitre("");
          setContenu("");
          setAfficherForm(false);
          setErreur("");
          mention.reinitialiser();
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("forum.erreur_creation"))),
      },
    );
  }

  const sujets = sujetsQuery.data?.results ?? [];
  const filtriert = Boolean(sucheWirksam) || reiter === "unbeantwortet" || categorie !== "";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("forum.titre")}</h1>
        <button
          type="button"
          onClick={() => setAfficherForm((v) => !v)}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("forum.nouveau_sujet")}
        </button>
      </div>

      {afficherForm && (
        <form onSubmit={soumettre} className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="mb-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("forum.categorie_label")}
            </label>
            <select
              value={categorieForm}
              onChange={(e) => setCategorieForm(e.target.value as CategorieForum)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`categorie.${cat}`)}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder={t("forum.titre_placeholder")}
            className="mb-2 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <div className="relative mb-2">
            <textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder={t("forum.contenu_placeholder")}
              rows={3}
              className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
            />
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
          </div>
          {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}
          <button
            type="submit"
            disabled={creer.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("forum.publier_sujet")}
          </button>
        </form>
      )}

      <input
        type="search"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder={t("forum.suche_placeholder")}
        aria-label={t("forum.suche_placeholder")}
        className="mb-3 w-full rounded-full border border-text-tertiary/30 bg-bg-primary px-4 py-2 text-sm"
      />

      <div
        className="mb-2 flex flex-wrap gap-2"
        role="group"
        aria-label={t("forum.sortierung_label")}
      >
        {REITER.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reiter === r}
            onClick={() => setReiter(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              reiter === r ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
            }`}
          >
            {t(`forum.sort_${r}`)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={categorie === ""}
          onClick={() => setCategorie("")}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
            categorie === ""
              ? "bg-text-primary text-bg-primary"
              : "bg-bg-primary text-text-secondary"
          }`}
        >
          {t("forum.categorie_toutes")}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={categorie === cat}
            onClick={() => setCategorie(cat)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${KATEGORIE_FARBE[cat]} ${
              categorie === cat ? "ring-2 ring-text-primary/60" : "opacity-80"
            }`}
          >
            {t(`categorie.${cat}`)}
          </button>
        ))}
      </div>

      {sujetsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("forum.chargement")}</p>
      )}
      {sujetsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("forum.erreur_chargement")}</p>
      )}
      {sujetsQuery.data && sujets.length === 0 && (
        <p className="text-sm text-text-tertiary">
          {filtriert ? t("forum.aucun_resultat") : t("forum.aucun_sujet")}
        </p>
      )}

      <div className="space-y-2">
        {sujets.map((sujet) => {
          const neu =
            !sujet.est_auteur &&
            istForumThemaNeu(sujet.letzte_aktivitaet, sujet.id, gesehen, grundlinie);
          const wer = sujet.letzte_antwort_von;
          const wann = vorZeit(sujet.letzte_aktivitaet);
          return (
            // La carte entière reste cliquable (Link en superposition) ; le contenu passe en
            // `pointer-events-none`, seule la zone du bouton de partage réactive les clics (voir
            // le commentaire d'origine, demande utilisateur du 2026-09-29).
            <div
              key={sujet.id}
              className="relative rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
            >
              <Link
                to={`/forum/${sujet.id}`}
                className="absolute inset-0"
                aria-label={sujet.titre}
              />
              <div className="pointer-events-none flex items-start gap-3">
                <ChatAvatar
                  name={`${sujet.auteur.prenom} ${sujet.auteur.nom}`}
                  photo={sujet.auteur.photo}
                  groesse="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {neu && (
                      <span
                        role="img"
                        aria-label={t("forum.neu_marke")}
                        title={t("forum.neu_marke")}
                        className="h-2 w-2 shrink-0 rounded-full bg-ca"
                      />
                    )}
                    {sujet.est_epingle && <span title={t("forum.epingle")}>📌</span>}
                    {sujet.est_verrouille && <span title={t("forum.verrouille")}>🔒</span>}
                    {sujet.est_masque && (
                      <span className="rounded bg-status-dangerBg px-1.5 py-0.5 text-[9px] font-bold text-status-dangerText">
                        {t("forum.masque_badge")}
                      </span>
                    )}
                    <span className="text-sm font-bold text-text-primary">{sujet.titre}</span>
                    {sujet.beste_antwort && (
                      <span className="rounded bg-status-successBg px-1.5 py-0.5 text-[10px] font-bold text-status-successText">
                        {t("forum.geloest")} ✓
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KATEGORIE_FARBE[sujet.categorie]}`}
                    >
                      {t(`categorie.${sujet.categorie}`)}
                    </span>
                    <span>
                      {wer
                        ? t("forum.letzte_aktivitaet", { wer, wann })
                        : t("forum.letzte_aktivitaet_ohne", { wann })}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] leading-tight text-text-tertiary">
                  <div className="font-semibold text-text-primary">
                    {t("forum.nombre_reponses", { count: sujet.nombre_reponses })}
                  </div>
                  {sujet.nombre_reaktionen > 0 && (
                    <div className="mt-0.5">
                      ☺ {t("forum.nombre_reaktionen", { count: sujet.nombre_reaktionen })}
                    </div>
                  )}
                </div>
                <div className="relative z-10 shrink-0 pointer-events-auto">
                  <ShareButton path={`/forum/${sujet.id}`} titre={sujet.titre} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
