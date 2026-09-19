/**
 * Page "Événements" (mockup #pg-evenements, FDD §3.4/F-005/F-006, Release Plan Phase 2A).
 * 3 onglets, comme le mockup : "À venir" (catalogue publié, à venir), "Passés" (catalogue
 * publié, déjà passé — purement informatif, pas de bouton d'inscription) et "Mes inscriptions"
 * (`useInscriptions()` sans filtre : le backend scope déjà à mes propres inscriptions pour un
 * rôle < Bureau Admin, voir InscriptionViewSet.get_queryset — même principe IDOR que
 * MessageriePage/GroupesPage. Un Bureau Admin+ verrait ici TOUTES les inscriptions plutôt que
 * les siennes propres ; cas limite accepté, cette page cible d'abord l'usage membre, la gestion
 * du catalogue se fait sur /admin/events).
 *
 * S'inscrire ouvre une modale (mockup #m-inscription) : places, régime alimentaire, remarques.
 * Le prix affiché n'est qu'indicatif — comme boutique/adhésions/cotisations, le montant réel
 * (et la capacité) est toujours recalculé et vérifié côté serveur, jamais fait confiance au
 * frontend (CLAUDE.md §8, voir InscrirePayload/EvenementViewSet.inscrire). Il n'y a pas de
 * paiement intégré directement ici : une inscription payante repasse par la page Cotisation
 * (mockup : bouton "Payer maintenant" sur l'onglet "Mes inscriptions" → goTo('cotisation')),
 * même principe que le panier boutique qui renvoie vers son propre flux de paiement.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import {
  useAnnulerInscription,
  useEvenements,
  useInscriptions,
  useInscrire,
} from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Evenement, RegimeAlimentaire } from "../../types/evenements";

type Onglet = "avenir" | "passes" | "inscrits";

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long" });
}

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function ModaleInscription({ evenement, onClose }: { evenement: Evenement; onClose: () => void }) {
  const { t } = useTranslation("evenements");
  const inscrire = useInscrire();
  const [places, setPlaces] = useState(1);
  const [regime, setRegime] = useState<RegimeAlimentaire>("aucun");
  const [remarques, setRemarques] = useState("");
  const [erreur, setErreur] = useState("");

  const maxPlaces =
    evenement.places_restantes !== null ? Math.min(4, Math.max(evenement.places_restantes, 1)) : 4;

  function confirmer() {
    inscrire.mutate(
      { evenement: evenement.id, places, regime_alimentaire: regime, remarques },
      {
        onSuccess: onClose,
        onError: (err) => setErreur(extractApiErrorMessage(err, t("erreur_inscription"))),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">{t("modal_inscription_titre")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-cid bg-bg-secondary p-2.5">
          <div className="flex-1">
            <div className="text-sm font-bold text-text-primary">{evenement.titre}</div>
            <div className="text-xs text-text-tertiary">
              {formatDate(evenement.date_evenement)} · {evenement.lieu}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-ca">
              {evenement.gratuit ? t("gratuit") : formatMontant(evenement.cout)}
            </div>
            {!evenement.gratuit && <div className="text-[10px] text-text-tertiary">/ pers.</div>}
          </div>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("modal_places")}
            </label>
            <select
              value={places}
              onChange={(e) => setPlaces(Number(e.target.value))}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              {Array.from({ length: maxPlaces }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("modal_regime")}
            </label>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value as RegimeAlimentaire)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              <option value="aucun">{t("regime_aucun")}</option>
              <option value="halal">{t("regime_halal")}</option>
              <option value="vegetarien">{t("regime_vegetarien")}</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("modal_remarques")}
          </label>
          <textarea
            value={remarques}
            onChange={(e) => setRemarques(e.target.value)}
            placeholder={t("modal_remarques_placeholder")}
            rows={2}
            className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
          />
        </div>

        {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
          >
            {t("annuler")}
          </button>
          <button
            type="button"
            onClick={confirmer}
            disabled={inscrire.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {evenement.gratuit ? t("modal_confirmer") : t("modal_confirmer_payer")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EvenementCarte({
  evenement,
  passe,
  onInscrire,
  cardRef,
}: {
  evenement: Evenement;
  passe: boolean;
  onInscrire: (evenement: Evenement) => void;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation("evenements");
  const remplissage =
    evenement.places_max !== null
      ? Math.min(100, Math.round((evenement.places_reservees / evenement.places_max) * 100))
      : null;
  const complet = evenement.places_restantes !== null && evenement.places_restantes <= 0;

  return (
    <div ref={cardRef} className="overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm">
      <div className="flex items-center justify-between bg-ca px-3 py-2 text-white">
        <span className="text-sm font-bold">{evenement.titre}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{formatDate(evenement.date_evenement)}</span>
          <ShareButton
            path={`/evenements?evenement=${evenement.id}`}
            titre={evenement.titre}
            texte={`${evenement.titre} — ${formatDate(evenement.date_evenement)}, ${evenement.lieu}`}
            variant="inverse"
          />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
          <span>{evenement.lieu}</span>
          <span>
            {evenement.places_max !== null
              ? t("places_sur_max", {
                  reservees: evenement.places_reservees,
                  max: evenement.places_max,
                })
              : t("places_illimitees")}
          </span>
          <span>
            {evenement.gratuit
              ? t("gratuit")
              : t("cout_par_personne", { cout: formatMontant(evenement.cout) })}
          </span>
        </div>

        {!passe && remplissage !== null && (
          <div>
            <div className="mb-0.5 text-[10px] text-text-tertiary">
              {t("remplissage", { pct: remplissage })}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
              <div className="h-full bg-ca" style={{ width: `${remplissage}%` }} />
            </div>
          </div>
        )}

        {!passe && (
          <button
            type="button"
            onClick={() => onInscrire(evenement)}
            disabled={complet}
            className="w-full rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {complet
              ? t("complet")
              : evenement.gratuit
                ? t("sinscrire_gratuit")
                : t("sinscrire_payer")}
          </button>
        )}
        {passe && (
          <span className="inline-block rounded bg-bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
            {t("terminee")}
          </span>
        )}
      </div>
    </div>
  );
}

export default function EvenementsPage() {
  const { t } = useTranslation("evenements");
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<Onglet>("avenir");
  const [evenementInscription, setEvenementInscription] = useState<Evenement | null>(null);
  const [erreurAnnulation, setErreurAnnulation] = useState("");

  const today = useMemo(aujourdhuiISO, []);
  const avenirQuery = useEvenements({ statut: "publie", date_apres: today });
  const passesQuery = useEvenements({ statut: "publie", date_avant: today });
  const inscriptionsQuery = useInscriptions();
  const annulerInscription = useAnnulerInscription();

  // Lien profond depuis une notification (?evenement=<id>, voir useDeepLinkCible) — bascule
  // automatiquement sur l'onglet ("avenir"/"passes") qui contient effectivement l'événement visé,
  // dès que les données correspondantes arrivent.
  const { cibleId: evenementCible, refCible } = useDeepLinkCible("evenement");
  useEffect(() => {
    if (!evenementCible) return;
    if (avenirQuery.data?.results.some((e) => e.id === evenementCible)) {
      setOnglet("avenir");
    } else if (passesQuery.data?.results.some((e) => e.id === evenementCible)) {
      setOnglet("passes");
    }
  }, [evenementCible, avenirQuery.data, passesQuery.data]);

  function annuler(id: string) {
    annulerInscription.mutate(id, {
      onError: (err) =>
        setErreurAnnulation(extractApiErrorMessage(err, t("inscriptions_erreur_annulation"))),
    });
  }

  const requete =
    onglet === "avenir" ? avenirQuery : onglet === "passes" ? passesQuery : inscriptionsQuery;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("titre")}</h1>

      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        {(["avenir", "passes", "inscrits"] as const).map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => setOnglet(val)}
            className={`px-3 py-2 text-sm font-medium ${
              onglet === val
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`tab_${val}`)}
          </button>
        ))}
      </div>

      {requete.isLoading && <p className="text-sm text-text-tertiary">{t("chargement")}</p>}
      {requete.isError && (
        <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>
      )}

      {onglet !== "inscrits" && (
        <>
          {(onglet === "avenir" ? avenirQuery : passesQuery).data?.results.length === 0 && (
            <p className="text-sm text-text-tertiary">
              {onglet === "avenir" ? t("aucun_evenement") : t("aucun_evenement_passe")}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(onglet === "avenir" ? avenirQuery : passesQuery).data?.results.map((evenement) => (
              <EvenementCarte
                key={evenement.id}
                evenement={evenement}
                passe={onglet === "passes"}
                onInscrire={setEvenementInscription}
                cardRef={refCible(evenement.id)}
              />
            ))}
          </div>
        </>
      )}

      {onglet === "inscrits" && (
        <div className="space-y-2">
          {erreurAnnulation && <p className="text-xs text-status-dangerText">{erreurAnnulation}</p>}
          {inscriptionsQuery.data?.results.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("aucune_inscription")}</p>
          )}
          {inscriptionsQuery.data?.results.map((inscription) => (
            <div
              key={inscription.id}
              className="flex items-center justify-between rounded-cid-lg bg-bg-primary p-3 shadow-sm"
            >
              <div>
                <div className="text-sm font-bold text-text-primary">
                  {inscription.evenement_detail?.titre ?? t("evenement_inconnu")}
                </div>
                <div className="text-xs text-text-tertiary">
                  {inscription.evenement_detail &&
                    formatDate(inscription.evenement_detail.date_evenement)}
                  {" · "}
                  {t("places_count", { count: inscription.places })}
                  {" · "}
                  {inscription.evenement_detail?.gratuit
                    ? t("gratuit")
                    : formatMontant(inscription.montant_paye)}
                  {" · "}
                  <span
                    className={
                      inscription.statut === "confirmee"
                        ? "font-medium text-status-successText"
                        : inscription.statut === "en_attente_paiement"
                          ? "font-medium text-status-warningText"
                          : "font-medium text-text-tertiary"
                    }
                  >
                    {t(`inscription_statut_${inscription.statut}`)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {inscription.statut === "en_attente_paiement" && (
                  <button
                    type="button"
                    onClick={() => navigate("/cotisation")}
                    className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
                  >
                    {t("payer_maintenant")}
                  </button>
                )}
                {inscription.statut !== "annulee" && (
                  <button
                    type="button"
                    onClick={() => annuler(inscription.id)}
                    className="rounded-cid px-3 py-1 text-xs font-medium text-text-tertiary hover:bg-bg-secondary"
                  >
                    {t("inscriptions_annuler")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {evenementInscription && (
        <ModaleInscription
          evenement={evenementInscription}
          onClose={() => setEvenementInscription(null)}
        />
      )}
    </div>
  );
}
