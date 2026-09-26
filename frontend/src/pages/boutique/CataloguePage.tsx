/**
 * Page membre "Boutique — Catalogue" (mockup #pg-boutique, FDD §3.4).
 *
 * Grille de produits publiés avec filtre par catégorie, sélecteur de variante (taille/couleur)
 * et ajout au panier (store Zustand persisté en session, voir panierStore.ts). Le prix affiché
 * n'est qu'indicatif — comme pour les autres modules (cotisations, adhésions), le montant
 * réellement facturé est toujours recalculé côté serveur à la commande (CLAUDE.md §8).
 *
 * Portée : uniquement les produits `statut=publie` (le backend ne renvoie de toute façon que
 * ceux-ci à un rôle < Bureau Admin, voir ProduitViewSet.get_queryset) — pas de recherche texte
 * ni de tri (absents du mockup #pg-boutique, qui n'a qu'un filtre catégorie).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useProduits } from "../../hooks/useBoutique";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import { nombreArticlesPanier, totalPanier, usePanierStore } from "../../store/panierStore";
import type { CategorieProduit, Produit, RegleReduction, VarianteProduit } from "../../types/boutique";

// "bon_achat" en dernier (demande utilisateur du 2026-09-23, "Gutschein soll als Kategorie im
// shop auftauchen") — un onglet de catégorie comme les autres, jamais un module séparé.
const CATEGORIES: CategorieProduit[] = [
  "vetements",
  "accessoires",
  "articles_club",
  "cartes_docs",
  "divers",
  "bon_achat",
];

// Bornes d'un montant de bon d'achat — purement indicatif côté UI (le serveur reste seul juge,
// voir bon_achat_montant_min/max, CLAUDE.md §8), miroir des bornes historiques de l'ancienne
// AcheterBonAchatPage (retirée le 2026-09-23, fusionnée ici).
const BON_ACHAT_MONTANT_MIN = 5;
const BON_ACHAT_MONTANT_MAX = 500;
const BON_ACHAT_MONTANTS_SUGGERES = [10, 25, 50, 100];

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function labelVariante(variante: VarianteProduit): string {
  const details = [variante.taille, variante.couleur].filter(Boolean).join(" / ");
  return details || "Unique";
}

/**
 * Libellé court d'un palier de réduction par quantité (demande utilisateur du 2026-09-23,
 * "Beim Kauf von über 10 Artikeln... 10% Rabatt" / "Beim Kauf von 5 Stück... geschenkten
 * Artikel") — affiché en badge sous le prix, voir ProduitCarte. `t` est injecté plutôt
 * qu'importé ici pour rester dans le composant (clé i18n interpolée).
 */
function labelRegleReduction(
  regle: RegleReduction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, opts?: Record<string, unknown>) => any,
): string {
  return regle.type_reduction === "pourcentage"
    ? t("catalogue.regle_pourcentage", { seuil: regle.seuil_quantite, pct: regle.pourcentage })
    : t("catalogue.regle_article_offert", { seuil: regle.seuil_quantite });
}

/**
 * Carte "bon_achat" (demande utilisateur du 2026-09-23, "Gutschein wird ein echtes Produkt im
 * Katalog") : montant librement choisi par l'acheteur au lieu du sélecteur taille/couleur —
 * fusionne ici ce que faisait l'ancienne AcheterBonAchatPage (page/module séparé, retiré sur
 * demande utilisateur explicite : "Gutschein soll als Kategorie im shop auftauchen und nicht
 * als eigenes Modul"). Pas de stock à vérifier (voir Produit.en_rupture/stock_faible toujours
 * false pour ce type côté backend) — uniquement les bornes de montant.
 */
function ProduitCarteBonAchat({
  produit,
  cardRef,
}: {
  produit: Produit;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation("boutique");
  const ajouter = usePanierStore((s) => s.ajouter);
  const varianteSentinelle = produit.variantes[0];
  const [montant, setMontant] = useState("25.00");

  const montantValide =
    montant !== "" &&
    !Number.isNaN(Number(montant)) &&
    Number(montant) >= BON_ACHAT_MONTANT_MIN &&
    Number(montant) <= BON_ACHAT_MONTANT_MAX;

  function handleAjouter() {
    if (!varianteSentinelle || !montantValide) return;
    ajouter({
      varianteId: varianteSentinelle.id,
      produitId: produit.id,
      nom: produit.nom,
      taille: "",
      couleur: "",
      prixUnitaire: Number(montant).toFixed(2),
      // Sentinelle très largement au-dessus de tout panier réaliste (voir
      // STOCK_SENTINELLE_BON_ACHAT côté backend) — jamais vérifiée pour ce type.
      stockDisponible: varianteSentinelle.stock,
      typeProduit: "bon_achat",
      reglesReduction: [],
    });
  }

  return (
    <div ref={cardRef} className="overflow-hidden rounded-cid-lg bg-card-gradient shadow-card">
      <div className="relative flex h-32 items-center justify-center bg-cal">
        <div className="absolute bottom-2 right-2 rounded-full bg-bg-primary/80 backdrop-blur-sm">
          <ShareButton path={`/boutique?produit=${produit.id}`} titre={produit.nom} />
        </div>
        {produit.image ? (
          <img src={produit.image} alt={produit.nom} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">🎁</span>
        )}
      </div>
      <div className="p-3">
        <div className="mb-0.5 text-sm font-bold text-text-primary">{produit.nom}</div>
        <div className="mb-2 line-clamp-2 text-xs text-text-tertiary">{produit.description}</div>

        <label
          htmlFor={`bon-montant-${produit.id}`}
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          {t("catalogue.bon_achat_montant_label", {
            min: BON_ACHAT_MONTANT_MIN,
            max: BON_ACHAT_MONTANT_MAX,
          })}
        </label>
        <input
          id={`bon-montant-${produit.id}`}
          type="number"
          min={BON_ACHAT_MONTANT_MIN}
          max={BON_ACHAT_MONTANT_MAX}
          step="0.01"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="mb-2 w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        />
        <div className="mb-2 flex flex-wrap gap-1.5">
          {BON_ACHAT_MONTANTS_SUGGERES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMontant(m.toFixed(2))}
              className={`rounded-cid px-2 py-0.5 text-[11px] font-medium ${
                Number(montant) === m
                  ? "bg-ca text-white"
                  : "bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/70"
              }`}
            >
              {formatMontant(m)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-ca">
            {montantValide ? formatMontant(montant) : "—"}
          </span>
          <button
            type="button"
            onClick={handleAjouter}
            disabled={!varianteSentinelle || !montantValide}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("catalogue.ajouter")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProduitCarte({
  produit,
  cardRef,
}: {
  produit: Produit;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation("boutique");
  const ajouter = usePanierStore((s) => s.ajouter);
  const variantesEnStock = produit.variantes.filter((v) => v.stock > 0);
  const [varianteId, setVarianteId] = useState<string>(variantesEnStock[0]?.id ?? "");

  const varianteSelectionnee = produit.variantes.find((v) => v.id === varianteId);

  function handleAjouter() {
    if (!varianteSelectionnee) return;
    ajouter({
      varianteId: varianteSelectionnee.id,
      produitId: produit.id,
      nom: produit.nom,
      taille: varianteSelectionnee.taille,
      couleur: varianteSelectionnee.couleur,
      // prix_final (jamais prix seul) : reflète un éventuel rabais actif (CLAUDE.md §8 —
      // simple indicatif ici, le montant réel est de toute façon recalculé côté serveur).
      prixUnitaire: produit.prix_final,
      stockDisponible: varianteSelectionnee.stock,
      typeProduit: "physique",
      // Instantané des paliers actifs (demande utilisateur du 2026-09-23) — voir
      // panierStore.calculerReductionArticle, purement indicatif.
      reglesReduction: produit.regles_reduction_actives,
    });
  }

  return (
    <div ref={cardRef} className="overflow-hidden rounded-cid-lg bg-card-gradient shadow-card">
      <div className="relative flex h-32 items-center justify-center bg-cal">
        {produit.nouveaute && (
          <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white bg-ca">
            {t("catalogue.badge_nouveaute")}
          </span>
        )}
        {produit.pourcentage_reduction && (
          <span className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white bg-status-dangerText">
            {t("catalogue.badge_rabais", { pct: produit.pourcentage_reduction })}
          </span>
        )}
        <div className="absolute bottom-2 right-2 rounded-full bg-bg-primary/80 backdrop-blur-sm">
          <ShareButton path={`/boutique?produit=${produit.id}`} titre={produit.nom} />
        </div>
        {produit.image ? (
          <img src={produit.image} alt={produit.nom} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">🛍️</span>
        )}
      </div>
      <div className="p-3">
        <div className="mb-0.5 text-sm font-bold text-text-primary">{produit.nom}</div>
        <div className="mb-2 line-clamp-2 text-xs text-text-tertiary">{produit.description}</div>

        {produit.variantes.length > 1 && (
          <select
            aria-label={t("catalogue.variante_label")}
            value={varianteId}
            onChange={(e) => setVarianteId(e.target.value)}
            className="mb-2 w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          >
            {produit.variantes.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                {labelVariante(v)} {v.stock <= 0 ? `— ${t("catalogue.rupture")}` : ""}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center justify-between">
          {produit.pourcentage_reduction ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs text-text-tertiary line-through">
                {formatMontant(produit.prix)}
              </span>
              <span className="text-base font-bold text-status-dangerText">
                {formatMontant(produit.prix_final)}
              </span>
            </span>
          ) : (
            <span className="text-base font-bold text-ca">{formatMontant(produit.prix)}</span>
          )}
          <button
            type="button"
            onClick={handleAjouter}
            disabled={!varianteSelectionnee || varianteSelectionnee.stock <= 0}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("catalogue.ajouter")}
          </button>
        </div>
        {produit.regles_reduction_actives.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {produit.regles_reduction_actives.map((regle) => (
              <span
                key={regle.id}
                className="rounded-full bg-cal/30 px-1.5 py-0.5 text-[10px] font-medium text-cad"
              >
                🎁 {labelRegleReduction(regle, t)}
              </span>
            ))}
          </div>
        )}
        {produit.en_rupture ? (
          <span className="mt-1.5 inline-block rounded-full bg-status-dangerBg px-2 py-0.5 text-[10px] font-medium text-status-dangerText">
            {t("catalogue.rupture")}
          </span>
        ) : produit.stock_faible ? (
          <span className="mt-1.5 inline-block rounded-full bg-status-warningBg px-2 py-0.5 text-[10px] font-medium text-status-warningText">
            {t("catalogue.stock_faible", { stock: produit.stock_total })}
          </span>
        ) : (
          <div className="mt-1.5 text-[10px] text-text-tertiary">
            {t("catalogue.en_stock", { stock: produit.stock_total })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CataloguePage() {
  const { t } = useTranslation("boutique");
  const [categorie, setCategorie] = useState<CategorieProduit | "">("");

  const produitsQuery = useProduits({ statut: "publie", categorie: categorie || undefined });
  const { refCible } = useDeepLinkCible("produit");
  const articles = usePanierStore((s) => s.articles);
  const nombreArticles = useMemo(() => nombreArticlesPanier(articles), [articles]);
  const total = useMemo(() => totalPanier(articles), [articles]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("catalogue.titre")}</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategorie("")}
          className={`rounded-cid px-3 py-1.5 text-xs font-medium ${
            categorie === "" ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
          }`}
        >
          {t("catalogue.categorie_toutes")}
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

      {produitsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("catalogue.chargement")}</p>
      )}
      {produitsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("catalogue.erreur")}</p>
      )}
      {produitsQuery.data && produitsQuery.data.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("catalogue.aucun_produit")}</p>
      )}

      {produitsQuery.data && produitsQuery.data.results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {produitsQuery.data.results.map((produit) =>
            produit.type_produit === "bon_achat" ? (
              <ProduitCarteBonAchat
                key={produit.id}
                produit={produit}
                cardRef={refCible(produit.id)}
              />
            ) : (
              <ProduitCarte key={produit.id} produit={produit} cardRef={refCible(produit.id)} />
            ),
          )}
        </div>
      )}

      {nombreArticles > 0 && (
        <Link
          to="/boutique/panier"
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-cid-lg bg-ca px-4 py-3 text-white shadow-lg hover:bg-cad"
        >
          <span className="text-sm font-medium">
            {t("catalogue.panier_flottant", { count: nombreArticles })}
          </span>
          <span className="text-sm font-bold">{formatMontant(total)}</span>
        </Link>
      )}
    </div>
  );
}
