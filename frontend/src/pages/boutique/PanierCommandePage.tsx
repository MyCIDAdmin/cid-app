/**
 * Page membre "Boutique — Panier & Commande" (mockup #pg-boutique-panier, FDD §3.4).
 *
 * Stepper 3 étapes, même convention visuelle que CotisationStepperPage : Panier (revue des
 * articles, quantités) → Livraison (formulaire d'adresse) → Confirmation (récapitulatif +
 * validation). Le panier lui-même vit dans panierStore (Zustand, persisté en session) — cette
 * page ne fait que l'afficher/le soumettre.
 *
 * Aucun montant n'est envoyé au serveur (CLAUDE.md §8) : POST /boutique/commandes/passer/ ne
 * reçoit que des couples (variante, quantité) — le prix unitaire et le total affichés ici sont
 * purement indicatifs, recalculés à l'identique côté serveur sauf si le catalogue a changé entre
 * temps (auquel cas l'API répond avec le prix catalogue à jour, jamais celui du panier local).
 *
 * Adresse de livraison : pas de préremplissage depuis la fiche Membre (adresse_de/ville_de...)
 * dans cette itération — le formulaire de commande a ses propres champs dédiés côté modèle
 * (Commande.adresse_livraison etc., volontairement distincts de Membre pour permettre une
 * livraison à une adresse différente) ; seul le nom du destinataire est préremployé depuis le
 * compte connecté.
 *
 * PAUSE DU PAIEMENT EN LIGNE (retour utilisateur du 2026-09-19, même principe que
 * CotisationStepperPage/MODES_GATEWAY) : PAIEMENT_EN_LIGNE_ACTIF=false ci-dessous masque les
 * boutons Stripe/PayPal réels (initier-paiement-en-ligne, AHM-46) au profit des coordonnées
 * bancaires/PayPal de l'association (virement SEPA ou envoi PayPal manuel "Amis & Famille",
 * voir components/ui/PaymentInstructions) — le Directeur Financier confirme la réception
 * manuellement (CommandeViewSet.confirmer_paiement, déjà existant, aucun changement backend
 * nécessaire). Tout le code du paiement en ligne (useInitierPaiementEnLigneCommande,
 * payerEnLigne, erreurPaiement...) reste intact pour une réactivation future — il suffit de
 * repasser PAIEMENT_EN_LIGNE_ACTIF à true.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import PaymentInstructions from "../../components/ui/PaymentInstructions";
import {
  useInitierPaiementEnLigneCommande,
  usePasserCommande,
  useVariantesParIds,
  useVerifierBonAchat,
} from "../../hooks/useBoutique";
import {
  calculerReductionArticle,
  estArticleBonAchat,
  sousTotalNetArticle,
  totalPanierNet,
  usePanierStore,
} from "../../store/panierStore";
import { useAuthStore } from "../../store/authStore";
import type {
  BonAchatVerification,
  Commande,
  PasserCommandePayload,
  PasserelleCommande,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const PAIEMENT_EN_LIGNE_ACTIF = false;

function formatMontant(montant: number | string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

interface EtapeIndicateurProps {
  numero: 1 | 2 | 3;
  label: string;
  active: boolean;
  franchie: boolean;
}

function EtapeIndicateur({ numero, label, active, franchie }: EtapeIndicateurProps) {
  const cur = active || franchie;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          cur ? "bg-ca text-white" : "bg-bg-tertiary text-text-tertiary"
        }`}
      >
        {numero}
      </div>
      <span className={`text-xs font-medium ${cur ? "text-text-primary" : "text-text-tertiary"}`}>
        {label}
      </span>
    </div>
  );
}

function livraisonInitiale(nomDestinataire: string) {
  return {
    nom_destinataire: nomDestinataire,
    adresse_livraison: "",
    code_postal_livraison: "",
    ville_livraison: "",
    pays_livraison: "Allemagne",
    telephone_livraison: "",
  };
}

export default function PanierCommandePage() {
  const { t } = useTranslation("boutique");
  const user = useAuthStore((s) => s.user);

  const articles = usePanierStore((s) => s.articles);
  const changerQuantite = usePanierStore((s) => s.changerQuantite);
  const retirer = usePanierStore((s) => s.retirer);
  const vider = usePanierStore((s) => s.vider);
  const synchroniserStocks = usePanierStore((s) => s.synchroniserStocks);
  const passerCommandeMutation = usePasserCommande();
  const paiementMutation = useInitierPaiementEnLigneCommande();
  const verifierBonAchatMutation = useVerifierBonAchat();

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [livraison, setLivraison] = useState(() =>
    livraisonInitiale(user ? `${user.prenom ?? ""} ${user.nom ?? ""}`.trim() || user.email : ""),
  );
  const [commandeConfirmee, setCommandeConfirmee] = useState<Commande | null>(null);
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null);

  // Bon d'achat au checkout (demande utilisateur du 2026-09-23) — la vérification n'est qu'un
  // aperçu non-consommant (voir useVerifierBonAchat) : la validité réelle n'est de toute façon
  // revérifiée que côté serveur, sous verrou, au moment de `passer` (CLAUDE.md §8).
  const [codeBonAchat, setCodeBonAchat] = useState("");
  const [bonAchatVerifie, setBonAchatVerifie] = useState<BonAchatVerification | null>(null);
  const [bonAchatErreur, setBonAchatErreur] = useState<string | null>(null);

  // Total NET des réductions quantité indicatives (demande utilisateur du 2026-09-23) — jamais
  // le montant qui fait foi (recalculé côté serveur), voir panierStore.totalPanierNet.
  const total = totalPanierNet(articles);
  const totalApresBonAchat = bonAchatVerifie
    ? Math.max(total - Math.min(Number(bonAchatVerifie.solde), total), 0)
    : total;

  function handleVerifierBonAchat() {
    if (!codeBonAchat.trim()) return;
    setBonAchatErreur(null);
    verifierBonAchatMutation.mutate(
      { code: codeBonAchat.trim() },
      {
        onSuccess: (verification) => {
          if (!verification.utilisable) {
            setBonAchatVerifie(null);
            setBonAchatErreur(t("commande.bon_achat_inutilisable"));
            return;
          }
          setBonAchatVerifie(verification);
        },
        onError: (error) => {
          setBonAchatVerifie(null);
          setBonAchatErreur(extractApiErrorMessage(error, t("commande.bon_achat_erreur")));
        },
      },
    );
  }

  function retirerBonAchat() {
    setCodeBonAchat("");
    setBonAchatVerifie(null);
    setBonAchatErreur(null);
  }

  // Revalidation live du stock (le panier ne conserve qu'un instantané figé pris à l'ajout) :
  // détecte dès l'ouverture du panier les articles devenus "ausverkauft" entre-temps (commandés
  // par quelqu'un d'autre, ou produit dépublié — voir docstring panierStore.synchroniserStocks).
  const varianteIds = articles.map((a) => a.varianteId);
  const stocksQuery = useVariantesParIds(varianteIds);
  useEffect(() => {
    if (!stocksQuery.data) return;
    const stocksParId: Record<string, number> = {};
    for (const variante of stocksQuery.data) {
      stocksParId[variante.id] = variante.stock;
    }
    synchroniserStocks(stocksParId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocksQuery.data]);

  const articlesIndisponibles = articles.filter((a) => a.stockDisponible <= 0 || a.quantite <= 0);
  const panierBloque = articlesIndisponibles.length > 0;

  function handleValiderLivraison(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEtape(3);
  }

  function handlePasserCommande() {
    const payload: PasserCommandePayload = {
      lignes: articles.map((a) => ({
        variante: a.varianteId,
        quantite: a.quantite,
        // Seul cas où un montant part du client (demande utilisateur du 2026-09-23, "Gutschein
        // wird ein echtes Produkt im Katalog") — revalidé quand même côté serveur contre
        // bon_achat_montant_min()/max() (CLAUDE.md §8), voir LigneCommandeEntree.montant.
        ...(estArticleBonAchat(a) && { montant: a.prixUnitaire }),
      })),
      ...livraison,
      ...(bonAchatVerifie && { code_bon_achat: bonAchatVerifie.code }),
    };
    passerCommandeMutation.mutate(payload, {
      onSuccess: (commande) => {
        setCommandeConfirmee(commande);
        vider();
      },
    });
  }

  function payerEnLigne(passerelle: PasserelleCommande) {
    if (!commandeConfirmee) return;
    setErreurPaiement(null);
    paiementMutation.mutate(
      { id: commandeConfirmee.id, payload: { passerelle } },
      {
        onSuccess: ({ redirect_url }) => {
          window.location.href = redirect_url;
        },
        onError: (error) => {
          setErreurPaiement(extractApiErrorMessage(error, t("commande.erreur_paiement")));
        },
      },
    );
  }

  if (commandeConfirmee) {
    // Le paiement en ligne (Stripe/PayPal) ne peut être proposé que tant que la commande est
    // "en_attente" — voir STATUTS_CONFIRMABLES_PAIEMENT côté backend/types ; toujours vrai juste
    // après passer(), gardé ici par cohérence si ce composant est réutilisé un jour.
    const peutPayerEnLigne = commandeConfirmee.statut === "en_attente";
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-6 text-center shadow-sm">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="mb-2 text-lg font-bold text-text-primary">
          {t("commande.confirmee_titre")}
        </h1>
        <p className="mb-1 text-sm text-text-secondary">
          {t("commande.confirmee_numero", { numero: commandeConfirmee.numero_commande })}
        </p>
        <p className="mb-5 text-xs text-text-tertiary">{t("commande.confirmee_email")}</p>

        {Number(commandeConfirmee.montant_bon_achat) > 0 && (
          <p className="mb-5 rounded-cid bg-status-successBg px-3 py-2 text-xs text-status-successText">
            {Number(commandeConfirmee.montant_du) <= 0
              ? t("commande.bon_achat_couvre_tout", {
                  montant: formatMontant(commandeConfirmee.montant_bon_achat),
                })
              : t("commande.bon_achat_applique", {
                  montant: formatMontant(commandeConfirmee.montant_bon_achat),
                  reste: formatMontant(commandeConfirmee.montant_du),
                })}
          </p>
        )}

        {peutPayerEnLigne && PAIEMENT_EN_LIGNE_ACTIF && (
          <div className="mb-5 rounded-cid border border-text-tertiary/10 p-4 text-left">
            <h2 className="mb-1 text-xs font-bold text-text-primary">
              {t("commande.payer_titre")}
            </h2>
            <p className="mb-3 text-xs text-text-tertiary">{t("commande.payer_note")}</p>
            {erreurPaiement && (
              <p className="mb-2 text-xs text-status-dangerText">{erreurPaiement}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => payerEnLigne("stripe")}
                disabled={paiementMutation.isPending}
                className="rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
              >
                {paiementMutation.isPending ? t("commande.payer_en_cours") : t("commande.payer_stripe")}
              </button>
              <button
                type="button"
                onClick={() => payerEnLigne("paypal")}
                disabled={paiementMutation.isPending}
                className="rounded-cid border border-ca px-3 py-2 text-sm font-medium text-ca hover:bg-cal/20 disabled:opacity-40"
              >
                {paiementMutation.isPending ? t("commande.payer_en_cours") : t("commande.payer_paypal")}
              </button>
            </div>
          </div>
        )}

        {peutPayerEnLigne && !PAIEMENT_EN_LIGNE_ACTIF && (
          <div className="mb-5 rounded-cid border border-text-tertiary/10 p-4 text-left">
            <h2 className="mb-1 text-xs font-bold text-text-primary">
              {t("commande.payer_hors_ligne_titre")}
            </h2>
            <p className="mb-3 text-xs text-text-tertiary">{t("commande.payer_hors_ligne_note")}</p>
            <div className="flex flex-col gap-2">
              <PaymentInstructions mode="virement_sepa" />
              <PaymentInstructions mode="paypal" />
            </div>
          </div>
        )}

        <Link
          to="/boutique"
          className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad"
        >
          {peutPayerEnLigne ? t("commande.payer_plus_tard") : t("commande.retour_catalogue")}
        </Link>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="rounded-cid-lg bg-bg-primary p-6 text-center shadow-sm">
        <p className="mb-4 text-sm text-text-tertiary">{t("commande.panier_vide")}</p>
        <Link
          to="/boutique"
          className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad"
        >
          {t("commande.retour_catalogue")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("commande.titre")}</h1>

      <div className="mb-5 flex items-center gap-4">
        <EtapeIndicateur
          numero={1}
          label={t("commande.etape_panier")}
          active={etape === 1}
          franchie={etape > 1}
        />
        <div className="h-px w-8 bg-text-tertiary/20" />
        <EtapeIndicateur
          numero={2}
          label={t("commande.etape_livraison")}
          active={etape === 2}
          franchie={etape > 2}
        />
        <div className="h-px w-8 bg-text-tertiary/20" />
        <EtapeIndicateur
          numero={3}
          label={t("commande.etape_confirmation")}
          active={etape === 3}
          franchie={false}
        />
      </div>

      {etape === 1 && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("commande.mon_panier", { count: articles.length })}
          </h2>
          {stocksQuery.isLoading && (
            <p className="mb-2 text-xs text-text-tertiary">{t("commande.verification_stock")}</p>
          )}
          {panierBloque && (
            <p className="mb-2 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText">
              {t("commande.articles_indisponibles")}
            </p>
          )}
          <div className="space-y-2">
            {articles.map((a) => {
              const ligneId = a.ligneId ?? a.varianteId;
              const bonAchat = estArticleBonAchat(a);
              const estEpuise = a.stockDisponible <= 0 || a.quantite <= 0;
              return (
                <div
                  key={ligneId}
                  className="flex items-center gap-3 border-b border-text-tertiary/10 pb-2 last:border-0"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-text-primary">{a.nom}</div>
                    {bonAchat && (
                      <div className="text-xs text-text-tertiary">
                        🎁 {t("commande.article_bon_achat")}
                      </div>
                    )}
                    {!bonAchat && (a.taille || a.couleur) && (
                      <div className="text-xs text-text-tertiary">
                        {[a.taille, a.couleur].filter(Boolean).join(" / ")}
                      </div>
                    )}
                    {estEpuise && (
                      <div className="mt-0.5 text-[11px] font-medium text-status-dangerText">
                        {t("commande.article_ausverkauft")}
                      </div>
                    )}
                    {(() => {
                      const { quantiteOfferte, pourcentageApplique } =
                        calculerReductionArticle(a);
                      if (quantiteOfferte <= 0 && !pourcentageApplique) return null;
                      return (
                        <div className="mt-0.5 text-[11px] font-medium text-cad">
                          🎁{" "}
                          {quantiteOfferte > 0 &&
                            t("commande.article_offert_applique", { count: quantiteOfferte })}
                          {quantiteOfferte > 0 && pourcentageApplique ? " · " : ""}
                          {pourcentageApplique &&
                            t("commande.pourcentage_applique", { pct: pourcentageApplique })}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={t("commande.diminuer")}
                      disabled={estEpuise}
                      onClick={() => changerQuantite(ligneId, a.quantite - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-cid bg-bg-tertiary text-text-secondary disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-[16px] text-center text-sm">{a.quantite}</span>
                    <button
                      type="button"
                      aria-label={t("commande.augmenter")}
                      disabled={estEpuise || a.quantite >= a.stockDisponible}
                      onClick={() => changerQuantite(ligneId, a.quantite + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-cid bg-bg-tertiary text-text-secondary disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="min-w-[60px] text-right">
                    {(() => {
                      const brut = Number(a.prixUnitaire) * a.quantite;
                      const net = sousTotalNetArticle(a);
                      if (net >= brut) {
                        return <span className="text-sm font-bold text-ca">{formatMontant(net)}</span>;
                      }
                      return (
                        <span className="flex flex-col items-end">
                          <span className="text-[11px] text-text-tertiary line-through">
                            {formatMontant(brut)}
                          </span>
                          <span className="text-sm font-bold text-status-dangerText">
                            {formatMontant(net)}
                          </span>
                        </span>
                      );
                    })()}
                  </span>
                  <button
                    type="button"
                    aria-label={t("commande.retirer")}
                    onClick={() => retirer(ligneId)}
                    className="text-text-tertiary hover:text-status-dangerText"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-text-tertiary/20 pt-3">
            <span className="text-sm font-semibold text-text-primary">{t("commande.total")}</span>
            <span className="text-lg font-bold text-ca">{formatMontant(total)}</span>
          </div>
          <button
            type="button"
            disabled={panierBloque}
            onClick={() => setEtape(2)}
            className="mt-4 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("commande.continuer_livraison")}
          </button>
        </div>
      )}

      {etape === 2 && (
        <form
          onSubmit={handleValiderLivraison}
          className="grid gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label htmlFor="liv-nom" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("commande.destinataire_label")}
            </label>
            <input
              id="liv-nom"
              required
              value={livraison.nom_destinataire}
              onChange={(e) => setLivraison({ ...livraison, nom_destinataire: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="liv-adresse"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("commande.adresse_label")}
            </label>
            <input
              id="liv-adresse"
              required
              value={livraison.adresse_livraison}
              onChange={(e) => setLivraison({ ...livraison, adresse_livraison: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="liv-cp" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("commande.code_postal_label")}
            </label>
            <input
              id="liv-cp"
              required
              value={livraison.code_postal_livraison}
              onChange={(e) =>
                setLivraison({ ...livraison, code_postal_livraison: e.target.value })
              }
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="liv-ville"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("commande.ville_label")}
            </label>
            <input
              id="liv-ville"
              required
              value={livraison.ville_livraison}
              onChange={(e) => setLivraison({ ...livraison, ville_livraison: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="liv-pays"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("commande.pays_label")}
            </label>
            <input
              id="liv-pays"
              required
              value={livraison.pays_livraison}
              onChange={(e) => setLivraison({ ...livraison, pays_livraison: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="liv-tel" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("commande.telephone_label")}
            </label>
            <input
              id="liv-tel"
              value={livraison.telephone_livraison}
              onChange={(e) => setLivraison({ ...livraison, telephone_livraison: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => setEtape(1)}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("commande.precedent")}
            </button>
            <button
              type="submit"
              className="flex-1 rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
            >
              {t("commande.continuer_confirmation")}
            </button>
          </div>
        </form>
      )}

      {etape === 3 && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("commande.recapitulatif")}
          </h2>
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-tertiary">{t("commande.destinataire_label")}</dt>
            <dd className="text-text-primary">{livraison.nom_destinataire}</dd>
            <dt className="text-text-tertiary">{t("commande.adresse_label")}</dt>
            <dd className="text-text-primary">
              {livraison.adresse_livraison}, {livraison.code_postal_livraison}{" "}
              {livraison.ville_livraison}, {livraison.pays_livraison}
            </dd>
          </dl>

          <div className="mb-4 border-t border-text-tertiary/20 pt-3">
            <label
              htmlFor="code-bon-achat"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("commande.bon_achat_label")}
            </label>
            {bonAchatVerifie ? (
              <div className="flex items-center justify-between rounded-cid bg-status-successBg px-3 py-2 text-xs text-status-successText">
                <span>
                  {t("commande.bon_achat_valide", {
                    code: bonAchatVerifie.code,
                    solde: formatMontant(bonAchatVerifie.solde),
                  })}
                </span>
                <button
                  type="button"
                  onClick={retirerBonAchat}
                  className="font-medium underline hover:no-underline"
                >
                  {t("commande.bon_achat_retirer")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  id="code-bon-achat"
                  value={codeBonAchat}
                  onChange={(e) => setCodeBonAchat(e.target.value)}
                  placeholder={t("commande.bon_achat_placeholder")}
                  className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={handleVerifierBonAchat}
                  disabled={!codeBonAchat.trim() || verifierBonAchatMutation.isPending}
                  className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-cal/20 disabled:opacity-40"
                >
                  {verifierBonAchatMutation.isPending
                    ? t("commande.bon_achat_verification")
                    : t("commande.bon_achat_verifier")}
                </button>
              </div>
            )}
            {bonAchatErreur && (
              <p className="mt-1 text-xs text-status-dangerText">{bonAchatErreur}</p>
            )}
            <Link
              to="/boutique"
              className="mt-1 inline-block text-xs font-medium text-ca hover:underline"
            >
              {t("commande.bon_achat_acheter_lien")}
            </Link>
          </div>

          <div className="mb-4 flex flex-col gap-1 border-t border-text-tertiary/20 pt-3">
            {bonAchatVerifie && (
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span>{t("commande.total")}</span>
                <span className="line-through">{formatMontant(total)}</span>
              </div>
            )}
            {bonAchatVerifie && (
              <div className="flex items-center justify-between text-xs text-status-successText">
                <span>
                  {t("commande.bon_achat_deduit", {
                    montant: formatMontant(Math.min(Number(bonAchatVerifie.solde), total)),
                  })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">
                {bonAchatVerifie ? t("commande.total_a_payer") : t("commande.total")}
              </span>
              <span className="text-lg font-bold text-ca">
                {formatMontant(totalApresBonAchat)}
              </span>
            </div>
          </div>
          {passerCommandeMutation.isError && (
            <p className="mb-3 text-xs text-status-dangerText">
              {extractApiErrorMessage(passerCommandeMutation.error, t("commande.erreur"))}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEtape(2)}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("commande.precedent")}
            </button>
            <button
              type="button"
              onClick={handlePasserCommande}
              disabled={passerCommandeMutation.isPending || panierBloque}
              className="flex-1 rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("commande.confirmer_commande")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
