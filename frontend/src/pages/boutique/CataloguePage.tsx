/**
 * Page membre "Boutique — Catalogue" (mockup #pg-boutique, FDD §3.4). Restructurée le 2026-09-26
 * (demande utilisateur : porter la structure/le layout/le style de https://www.mycid.org/shop) :
 * bandeau d'en-tête, cartes produit façon mycid.org (badge image "Mitglieder Preis"/rupture,
 * stepper de quantité, bouton pleine largeur), lien vers une page de détail dédiée par produit
 * (voir ProduitDetailPage) — le clic sur l'image/le titre navigue désormais vers `/boutique/:id`
 * au lieu de rester uniquement sur la kachel, même principe que le "View Project" de
 * https://www.mycid.org/projects porté sur /projets le même jour (voir ProjetsPage/
 * ProjetDetailPage). Le panier (store Zustand persisté en session, voir panierStore.ts), les
 * variantes taille/couleur, les paliers de réduction quantité (RegleReduction) et le type
 * "bon_achat" restent EXACTEMENT les mêmes qu'avant — seule la présentation change.
 *
 * Prix membre/non-membre (demande utilisateur, "Preise für Mitglieder und nicht Mitglieder zu
 * definieren") : `produit.prix_affiche`/`produit.est_prix_membre` sont déjà résolus côté serveur
 * (ProduitSerializer.get_prix_affiche, à partir du statut du membre connecté) — cette page les
 * affiche tels quels, jamais recalculés ici (CLAUDE.md §8, même principe que prix_final avant).
 *
 * Portée : uniquement les produits `statut=publie` (le backend ne renvoie de toute façon que
 * ceux-ci à un rôle < Bureau Admin, voir ProduitViewSet.get_queryset) — pas de recherche texte
 * ni de tri (absents du mockup #pg-boutique, qui n'a qu'un filtre catégorie).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useProduits } from "../../hooks/useBoutique";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import { useAuthStore } from "../../store/authStore";
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

/** Stepper de quantité (−/count/+, mycid.org/shop) — bornée à [1, max]. Partagé par ProduitCarte
 * et ProduitDetailPage. */
function StepperQuantite({
  quantite,
  max,
  onChange,
  labelDiminuer,
  labelAugmenter,
}: {
  quantite: number;
  max: number;
  onChange: (quantite: number) => void;
  labelDiminuer: string;
  labelAugmenter: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={labelDiminuer}
        onClick={() => onChange(Math.max(1, quantite - 1))}
        disabled={quantite <= 1}
        className="flex h-7 w-7 items-center justify-center rounded-cid border border-text-tertiary/30 text-sm font-bold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold text-text-primary">{quantite}</span>
      <button
        type="button"
        aria-label={labelAugmenter}
        onClick={() => onChange(Math.min(max, quantite + 1))}
        disabled={quantite >= max}
        className="flex h-7 w-7 items-center justify-center rounded-cid border border-text-tertiary/30 text-sm font-bold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

/**
 * Carte "bon_achat" (demande utilisateur du 2026-09-23, "Gutschein wird ein echtes Produkt im
 * Katalog") : montant librement choisi par l'acheteur au lieu du sélecteur taille/couleur —
 * fusionne ici ce que faisait l'ancienne AcheterBonAchatPage (page/module séparé, retiré sur
 * demande utilisateur explicite : "Gutschein soll als Kategorie im shop auftauchen und nicht
 * als eigenes Modul"). Pas de stock à vérifier (voir Produit.en_rupture/stock_faible toujours
 * false pour ce type côté backend) — uniquement les bornes de montant. Jamais concernée par le
 * prix membre (voir Produit.prix_pour_membre côté backend : montant déjà libre).
 */
function ProduitCarteBonAchat({
  produit,
  cardRef,
}: {
  produit: Produit;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation("boutique");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ajouter = usePanierStore((s) => s.ajouter);
  const varianteSentinelle = produit.variantes[0];
  const [montant, setMontant] = useState("25.00");

  const montantValide =
    montant !== "" &&
    !Number.isNaN(Number(montant)) &&
    Number(montant) >= BON_ACHAT_MONTANT_MIN &&
    Number(montant) <= BON_ACHAT_MONTANT_MAX;

  // Cette page est désormais aussi embarquée dans l'onglet public "Shop" (Phase D, page
  // d'accueil publique, demande utilisateur : "'Hinzufügen' bei anonymem Besucher führt auf
  // /login statt in den Warenkorb") — un visiteur anonyme ne peut de toute façon pas passer
  // commande (voir PanierCommandePage, réservée aux authentifiés), autant l'envoyer se connecter
  // tout de suite plutôt que de le laisser remplir un panier inutilisable.
  function handleAjouter() {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
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
    <div
      ref={cardRef}
      className="flex flex-col overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm"
    >
      <div className="relative flex h-40 items-center justify-center bg-cal">
        <div className="absolute bottom-2 right-2 rounded-full bg-bg-primary/80 backdrop-blur-sm">
          <ShareButton path={`/boutique/${produit.id}`} titre={produit.nom} />
        </div>
        {produit.image ? (
          <img src={produit.image} alt={produit.nom} className="h-full w-full object-cover" />
        ) : (
          <span className="text-5xl">🎁</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
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
        <div className="mb-3 flex flex-wrap gap-1.5">
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

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-lg font-bold text-ca">
            {montantValide ? formatMontant(montant) : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAjouter}
          disabled={!varianteSentinelle || !montantValide}
          className="mt-2 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          🛒 {t("catalogue.ajouter")}
        </button>
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
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ajouter = usePanierStore((s) => s.ajouter);
  const variantesEnStock = produit.variantes.filter((v) => v.stock > 0);
  const [varianteId, setVarianteId] = useState<string>(variantesEnStock[0]?.id ?? "");
  const [quantite, setQuantite] = useState(1);

  const varianteSelectionnee = produit.variantes.find((v) => v.id === varianteId);
  const epuise = !varianteSelectionnee || varianteSelectionnee.stock <= 0;

  function handleChangerVariante(id: string) {
    setVarianteId(id);
    setQuantite(1);
  }

  // Voir la docstring de ProduitCarteBonAchat.handleAjouter ci-dessus (même gate, même raison).
  function handleAjouter() {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!varianteSelectionnee) return;
    ajouter(
      {
        varianteId: varianteSelectionnee.id,
        produitId: produit.id,
        nom: produit.nom,
        taille: varianteSelectionnee.taille,
        couleur: varianteSelectionnee.couleur,
        // prix_affiche (jamais prix/prix_final seuls) : déjà résolu côté serveur — prix membre
        // si applicable (produit.est_prix_membre), sinon prix soldé/catalogue (CLAUDE.md §8 —
        // simple indicatif ici, le montant réel est de toute façon recalculé côté serveur).
        prixUnitaire: produit.prix_affiche,
        stockDisponible: varianteSelectionnee.stock,
        typeProduit: "physique",
        // Instantané des paliers actifs (demande utilisateur du 2026-09-23) — voir
        // panierStore.calculerReductionArticle, purement indicatif.
        reglesReduction: produit.regles_reduction_actives,
      },
      quantite,
    );
  }

  return (
    <div
      ref={cardRef}
      className="flex flex-col overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm"
    >
      <div className="relative flex h-40 items-center justify-center bg-cal">
        {produit.nouveaute && (
          <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white bg-ca">
            {t("catalogue.badge_nouveaute")}
          </span>
        )}
        {/* Badge coin (mycid.org/shop) : "Mitglieder Preis" a priorité sur le rabais générique —
            c'est LUI qui détermine le montant réellement facturé (voir prix_pour_membre côté
            backend), afficher les deux à la fois serait trompeur. */}
        {produit.est_prix_membre ? (
          <span className="absolute right-2 top-2 rounded-full bg-status-dangerText px-2 py-0.5 text-[9px] font-bold text-white shadow">
            👑 {t("catalogue.badge_prix_membre")}
          </span>
        ) : (
          produit.pourcentage_reduction && (
            <span className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white bg-status-dangerText">
              {t("catalogue.badge_rabais", { pct: produit.pourcentage_reduction })}
            </span>
          )
        )}
        {epuise && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            {t("catalogue.rupture")}
          </span>
        )}
        <div className="absolute bottom-2 right-2 rounded-full bg-bg-primary/80 backdrop-blur-sm">
          <ShareButton path={`/boutique/${produit.id}`} titre={produit.nom} />
        </div>
        <Link
          to={`/boutique/${produit.id}`}
          className="absolute inset-0"
          aria-label={produit.nom}
        >
          {produit.image ? (
            <img src={produit.image} alt={produit.nom} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-5xl">🛍️</span>
          )}
        </Link>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <Link to={`/boutique/${produit.id}`} className="mb-0.5 text-sm font-bold text-text-primary hover:underline">
          {produit.nom}
        </Link>
        <div className="mb-2 line-clamp-2 text-xs text-text-tertiary">{produit.description}</div>

        {produit.variantes.length > 1 && (
          <select
            aria-label={t("catalogue.variante_label")}
            value={varianteId}
            onChange={(e) => handleChangerVariante(e.target.value)}
            className="mb-2 w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          >
            {produit.variantes.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                {labelVariante(v)} {v.stock <= 0 ? `— ${t("catalogue.rupture")}` : ""}
              </option>
            ))}
          </select>
        )}

        <div className="mb-2 flex items-center justify-between gap-2">
          {produit.est_prix_membre ? (
            <span className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-base font-bold text-status-dangerText">
                {formatMontant(produit.prix_affiche)}
              </span>
              <span className="text-xs text-text-tertiary line-through">
                {formatMontant(produit.prix_final)}
              </span>
              <span className="rounded-full bg-status-successBg px-1.5 py-0.5 text-[9px] font-bold text-status-successText">
                {t("catalogue.badge_prix_membre")}
              </span>
            </span>
          ) : produit.pourcentage_reduction ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs text-text-tertiary line-through">
                {formatMontant(produit.prix)}
              </span>
              <span className="text-base font-bold text-status-dangerText">
                {formatMontant(produit.prix_affiche)}
              </span>
            </span>
          ) : (
            <span className="text-base font-bold text-ca">{formatMontant(produit.prix_affiche)}</span>
          )}
          {!epuise && (
            <StepperQuantite
              quantite={quantite}
              max={varianteSelectionnee?.stock ?? 1}
              onChange={setQuantite}
              labelDiminuer={t("commande.diminuer")}
              labelAugmenter={t("commande.augmenter")}
            />
          )}
        </div>

        {produit.regles_reduction_actives.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
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
        <div className="mb-2 text-[10px] text-text-tertiary">
          {produit.en_rupture
            ? t("catalogue.rupture")
            : produit.stock_faible
              ? t("catalogue.stock_faible", { stock: produit.stock_total })
              : t("catalogue.en_stock", { stock: produit.stock_total })}
        </div>

        <button
          type="button"
          onClick={handleAjouter}
          disabled={epuise}
          className="mt-auto w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          🛒 {epuise ? t("catalogue.rupture") : t("catalogue.ajouter")}
        </button>
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
      {/* Bandeau d'en-tête (demande utilisateur 2026-09-26 : porter la structure de
          https://www.mycid.org/shop) — titre + sous-titre centrés, même principe que
          ProjetsPage (mycid.org/projects). */}
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-text-primary">{t("catalogue.titre")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("catalogue.sous_titre")}</p>
      </div>

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
        <div className="grid gap-4 stagger-children sm:grid-cols-2 lg:grid-cols-3">
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

// Constantes/fonctions volontairement co-localisées avec les composants (réutilisées par
// ProduitDetailPage) plutôt que déplacées dans un fichier séparé — react-refresh/only-export-
// components ne dégrade que le Fast Refresh en dev, pas le comportement runtime (même choix que
// Sidebar.tsx/GROUP_ORDER).
// eslint-disable-next-line react-refresh/only-export-components
export { ProduitCarte, ProduitCarteBonAchat, StepperQuantite, formatMontant, labelVariante, labelRegleReduction };
