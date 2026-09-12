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
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { usePasserCommande } from "../../hooks/useBoutique";
import { totalPanier, usePanierStore } from "../../store/panierStore";
import { useAuthStore } from "../../store/authStore";
import type { PasserCommandePayload } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

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
  const passerCommandeMutation = usePasserCommande();

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [livraison, setLivraison] = useState(() =>
    livraisonInitiale(user ? `${user.prenom ?? ""} ${user.nom ?? ""}`.trim() || user.email : ""),
  );
  const [commandeConfirmee, setCommandeConfirmee] = useState<string | null>(null);

  const total = totalPanier(articles);

  function handleValiderLivraison(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEtape(3);
  }

  function handlePasserCommande() {
    const payload: PasserCommandePayload = {
      lignes: articles.map((a) => ({ variante: a.varianteId, quantite: a.quantite })),
      ...livraison,
    };
    passerCommandeMutation.mutate(payload, {
      onSuccess: (commande) => {
        setCommandeConfirmee(commande.numero_commande);
        vider();
      },
    });
  }

  if (commandeConfirmee) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-6 text-center shadow-sm">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="mb-2 text-lg font-bold text-text-primary">
          {t("commande.confirmee_titre")}
        </h1>
        <p className="mb-1 text-sm text-text-secondary">
          {t("commande.confirmee_numero", { numero: commandeConfirmee })}
        </p>
        <p className="mb-5 text-xs text-text-tertiary">{t("commande.confirmee_email")}</p>
        <Link
          to="/boutique"
          className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad"
        >
          {t("commande.retour_catalogue")}
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
          <div className="space-y-2">
            {articles.map((a) => (
              <div
                key={a.varianteId}
                className="flex items-center gap-3 border-b border-text-tertiary/10 pb-2 last:border-0"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold text-text-primary">{a.nom}</div>
                  {(a.taille || a.couleur) && (
                    <div className="text-xs text-text-tertiary">
                      {[a.taille, a.couleur].filter(Boolean).join(" / ")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("commande.diminuer")}
                    onClick={() => changerQuantite(a.varianteId, a.quantite - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-cid bg-bg-tertiary text-text-secondary"
                  >
                    −
                  </button>
                  <span className="min-w-[16px] text-center text-sm">{a.quantite}</span>
                  <button
                    type="button"
                    aria-label={t("commande.augmenter")}
                    disabled={a.quantite >= a.stockDisponible}
                    onClick={() => changerQuantite(a.varianteId, a.quantite + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-cid bg-bg-tertiary text-text-secondary disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <span className="min-w-[60px] text-right text-sm font-bold text-ca">
                  {formatMontant(Number(a.prixUnitaire) * a.quantite)}
                </span>
                <button
                  type="button"
                  aria-label={t("commande.retirer")}
                  onClick={() => retirer(a.varianteId)}
                  className="text-text-tertiary hover:text-status-dangerText"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-text-tertiary/20 pt-3">
            <span className="text-sm font-semibold text-text-primary">{t("commande.total")}</span>
            <span className="text-lg font-bold text-ca">{formatMontant(total)}</span>
          </div>
          <button
            type="button"
            onClick={() => setEtape(2)}
            className="mt-4 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad"
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
          <div className="mb-4 flex items-center justify-between border-t border-text-tertiary/20 pt-3">
            <span className="text-sm font-semibold text-text-primary">{t("commande.total")}</span>
            <span className="text-lg font-bold text-ca">{formatMontant(total)}</span>
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
              disabled={passerCommandeMutation.isPending}
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
