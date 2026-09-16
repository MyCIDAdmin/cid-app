/**
 * Catalogue d'articles de paiement personnalisés — vue Administrateur App (retour utilisateur du
 * 2026-09-17 : "Artikeln / Elemente bei 'Cotisation' müssen vom APP-Admin verwaltbar sein
 * (Anlegen / Aktualisieren / Deaktivieren ...)").
 *
 * Décisions actées avec l'utilisateur (AskUserQuestion) :
 *  - Ces articles s'ajoutent aux 4 types fixes existants (cotisation/adhésion/événement/don), ils
 *    ne les remplacent pas.
 *  - Réservé exclusivement à l'Administrateur App (Role.SUPER_ADMIN) — voir la garde de route
 *    dans App.tsx et ArticleCataloguePermission côté backend.
 *
 * Pas de suppression exposée (jamais de suppression physique, voir
 * apps.cotisations.models.ArticleCatalogue) : un article se désactive (actif=false) au lieu
 * d'être supprimé, ce qui préserve l'intégrité des cotisations historiques qui le référencent
 * (on_delete=PROTECT). Structure calquée sur ConfigurationRelancePage (AHM-54) : formulaire de
 * création + tableau avec ligne éditable en ligne, un bouton bascule actif/inactif à la place du
 * bouton "supprimer".
 *
 * Mise à jour du 2026-09-17 (retour utilisateur : "die bestehende [Cotisation annuelle/Frais
 * d'adhésion] müssen auch verwaltbar sein") : la liste inclut désormais aussi les 2 lignes
 * techniques ArticleCatalogue.type_fixe (cotisation/adhésion) — seedées une fois en base, jamais
 * créées/renommées ici. Pour ces lignes, `ArticleCatalogueRow` affiche un libellé fixe (piloté par
 * i18n, jamais par le champ `libelle` renvoyé par l'API — celui-ci est ignoré en écriture côté
 * serveur) et n'affiche pas de champ libellé éditable, mais garde montant + bascule actif/inactif
 * pleinement fonctionnels, exactement comme pour les articles personnalisés (décision utilisateur :
 * "Auch deaktivierbar"). Ces 2 lignes sont épinglées en tête de tableau pour la lisibilité.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useArticlesCatalogue,
  useCreerArticleCatalogue,
  useModifierArticleCatalogue,
} from "../../hooks/useCotisations";
import type { ArticleCatalogue } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface ArticleCatalogueRowProps {
  article: ArticleCatalogue;
}

function ArticleCatalogueRow({ article }: ArticleCatalogueRowProps) {
  const { t } = useTranslation("cotisations");
  const modifierMutation = useModifierArticleCatalogue();

  // Libellé fixe (2026-09-17) : pour une ligne type_fixe, l'API ignore toute écriture sur
  // `libelle` (voir ArticleCatalogueSerializer.update côté backend) — l'intitulé affiché reste
  // piloté par i18n, jamais par article.libelle. Pas de state éditable pour ce champ ici.
  const estTypeFixe = article.type_fixe !== null;
  const libelleAffiche = estTypeFixe
    ? t(`catalogue_articles.type_fixe_${article.type_fixe}`)
    : article.libelle;

  const [libelle, setLibelle] = useState(article.libelle);
  const [montant, setMontant] = useState(article.montant);
  const modifiee = (!estTypeFixe && libelle !== article.libelle) || montant !== article.montant;

  function enregistrer() {
    const payload = estTypeFixe ? { montant } : { libelle, montant };
    modifierMutation.mutate({ id: article.id, payload });
  }

  function basculerActif() {
    modifierMutation.mutate({ id: article.id, payload: { actif: !article.actif } });
  }

  return (
    <tr className="border-b border-text-tertiary/10 last:border-0 align-top">
      <td className="px-4 py-2">
        {estTypeFixe ? (
          <div>
            <span data-testid={`article-catalogue-libelle-fixe-${article.id}`} className="text-xs font-medium text-text-primary">
              {libelleAffiche}
            </span>
            <span className="ml-2 inline-block rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              {t("catalogue_articles.badge_type_fixe")}
            </span>
          </div>
        ) : (
          <input
            type="text"
            data-testid={`article-catalogue-libelle-${article.id}`}
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            className="w-full min-w-[10rem] rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        )}
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          min="0.01"
          data-testid={`article-catalogue-montant-${article.id}`}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            article.actif
              ? "bg-status-successBg text-status-successText"
              : "bg-bg-tertiary text-text-secondary"
          }`}
        >
          {article.actif ? t("catalogue_articles.statut_actif") : t("catalogue_articles.statut_inactif")}
        </span>
        <div className="mt-1 text-xs text-text-tertiary">{formatDateTime(article.updated_at)}</div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enregistrer}
            disabled={!modifiee || modifierMutation.isPending}
            className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {modifierMutation.isPending
              ? t("catalogue_articles.en_cours")
              : t("catalogue_articles.enregistrer")}
          </button>
          <button
            type="button"
            onClick={basculerActif}
            disabled={modifierMutation.isPending}
            className={`rounded-cid border px-2 py-1 text-xs font-medium disabled:opacity-40 ${
              article.actif
                ? "border-status-dangerText text-status-dangerText hover:bg-status-dangerText/10"
                : "border-ca text-ca hover:bg-cal/20"
            }`}
          >
            {article.actif ? t("catalogue_articles.desactiver") : t("catalogue_articles.activer")}
          </button>
        </div>
        {modifierMutation.isError && (
          <p className="mt-1 text-xs text-status-dangerText">
            {extractApiErrorMessage(modifierMutation.error, t("catalogue_articles.erreur_action"))}
          </p>
        )}
      </td>
    </tr>
  );
}

function NouvelArticleForm() {
  const { t } = useTranslation("cotisations");
  const creerMutation = useCreerArticleCatalogue();

  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    creerMutation.mutate(
      { libelle, montant },
      {
        onSuccess: () => {
          setLibelle("");
          setMontant("");
        },
      },
    );
  }

  return (
    <form
      onSubmit={soumettre}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
    >
      <div className="min-w-[12rem] flex-1">
        <label
          htmlFor="article-catalogue-libelle"
          className="mb-1 block text-xs font-semibold uppercase text-text-tertiary"
        >
          {t("catalogue_articles.champ_libelle")}
        </label>
        <input
          id="article-catalogue-libelle"
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          required
        />
      </div>
      <div>
        <label
          htmlFor="article-catalogue-montant"
          className="mb-1 block text-xs font-semibold uppercase text-text-tertiary"
        >
          {t("catalogue_articles.champ_montant")}
        </label>
        <input
          id="article-catalogue-montant"
          type="number"
          step="0.01"
          min="0.01"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="w-28 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          required
        />
      </div>
      <button
        type="submit"
        disabled={creerMutation.isPending}
        className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {creerMutation.isPending ? t("catalogue_articles.en_cours") : t("catalogue_articles.ajouter")}
      </button>
      {creerMutation.isError && (
        <p className="w-full text-xs text-status-dangerText">
          {extractApiErrorMessage(creerMutation.error, t("catalogue_articles.erreur_action"))}
        </p>
      )}
    </form>
  );
}

export default function ArticlesCatalogueCotisationPage() {
  const { t } = useTranslation("cotisations");
  const articles = useArticlesCatalogue();

  // Les 2 lignes type_fixe (cotisation/adhésion) sont épinglées en tête de tableau (2026-09-17) —
  // plus lisible pour l'Administrateur App que mêlées aux articles personnalisés créés librement.
  // Tri stable : à ordre de type_fixe égal (les deux `null` entre eux, ou les deux non-null entre
  // eux — au plus 2 lignes non-null de toute façon), l'ordre renvoyé par l'API est conservé.
  const articlesTries = articles.data
    ? [...articles.data.results].sort(
        (a, b) => Number(b.type_fixe !== null) - Number(a.type_fixe !== null),
      )
    : undefined;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("catalogue_articles.titre")}</h1>
      <p className="mb-4 text-sm text-text-tertiary">{t("catalogue_articles.sous_titre")}</p>

      <NouvelArticleForm />

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("catalogue_articles.col_libelle")}</th>
              <th className="px-4 py-2">{t("catalogue_articles.col_montant")}</th>
              <th className="px-4 py-2">{t("catalogue_articles.col_statut")}</th>
              <th className="px-4 py-2">{t("catalogue_articles.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {articles.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("catalogue_articles.chargement")}
                </td>
              </tr>
            )}
            {articles.isError && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-status-dangerText">
                  {t("catalogue_articles.erreur_chargement")}
                </td>
              </tr>
            )}
            {articlesTries && articlesTries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("catalogue_articles.aucun")}
                </td>
              </tr>
            )}
            {articlesTries?.map((article) => (
              <ArticleCatalogueRow key={article.id} article={article} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
