/**
 * Page "Forum" (mockup #pg-forum, Release Plan §3.2 — 4 catégories fixes, Phase 4A).
 *
 * Liste des sujets (épinglés en tête, voir SujetCursorPagination côté backend), filtre par
 * catégorie, création d'un nouveau sujet. Le détail (réponses, épinglage/verrouillage/
 * modération) vit dans ForumSujetPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useCreerSujet, useSujets } from "../../hooks/useCommunaute";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import type { CategorieForum } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

const CATEGORIES: CategorieForum[] = ["football_ca", "vie_en_allemagne", "emploi", "general"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function ForumPage() {
  const { t } = useTranslation("communaute");
  const [categorie, setCategorie] = useState<CategorieForum | "">("");
  const [afficherForm, setAfficherForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [categorieForm, setCategorieForm] = useState<CategorieForum>("general");
  const [erreur, setErreur] = useState("");

  const sujetsQuery = useSujets({ categorie: categorie || undefined });
  const creer = useCreerSujet();
  // Mentions "@" (ajoutées le 2026-09-29) — voir hooks/useMentionAutocomplete.ts.
  const mention = useMentionAutocomplete(contenu, setContenu);

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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategorie("")}
          className={`rounded-cid px-3 py-1.5 text-xs font-medium ${
            categorie === "" ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
          }`}
        >
          {t("forum.categorie_toutes")}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategorie(cat)}
            className={`rounded-cid px-3 py-1.5 text-xs font-medium ${
              categorie === cat ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
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
      {sujetsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("forum.aucun_sujet")}</p>
      )}

      <div className="space-y-2">
        {sujetsQuery.data?.results.map((sujet) => (
          // La carte entière reste cliquable (Link en superposition, voir plus bas) — le bouton
          // de partage (demande utilisateur du 2026-09-29, module "Forum" : "Es soll möglich
          // sein Elemente in Social Media zu teilen") a besoin de sa propre zone cliquable, ce
          // qu'un <button> imbriqué dans un <a> ne permet pas proprement. Plutôt que de copier le
          // montage `<Link className="absolute inset-0">` + bouton positionné séparément déjà
          // utilisé ailleurs (CataloguePage.tsx) — dont l'ordre DOM ne garantit pas quel élément
          // capte le clic en cas de chevauchement — le contenu de la carte passe en
          // `pointer-events-none` et seule la zone du bouton de partage réactive
          // `pointer-events-auto` (avec un z-index explicite) : le Link capte tout le reste de la
          // carte sans ambiguïté, le bouton de partage capte uniquement sa propre zone.
          <div
            key={sujet.id}
            className="relative rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
          >
            <Link to={`/forum/${sujet.id}`} className="absolute inset-0" aria-label={sujet.titre} />
            <div className="pointer-events-none flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {sujet.est_epingle && <span title={t("forum.epingle")}>📌</span>}
                  {sujet.est_verrouille && <span title={t("forum.verrouille")}>🔒</span>}
                  {sujet.est_masque && (
                    <span className="rounded bg-status-dangerBg px-1.5 py-0.5 text-[9px] font-bold text-status-dangerText">
                      {t("forum.masque_badge")}
                    </span>
                  )}
                  <span className="text-sm font-bold text-text-primary">{sujet.titre}</span>
                </div>
                <div className="mt-0.5 text-xs text-text-tertiary">
                  {t(`categorie.${sujet.categorie}`)} · {sujet.auteur.prenom} {sujet.auteur.nom} ·{" "}
                  {formatDate(sujet.created_at)}
                </div>
                <div className="mt-1 text-xs text-text-tertiary">
                  {t("forum.nombre_reponses", { count: sujet.nombre_reponses })}
                </div>
              </div>
              <div className="relative z-10 shrink-0 pointer-events-auto">
                <ShareButton path={`/forum/${sujet.id}`} titre={sujet.titre} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
