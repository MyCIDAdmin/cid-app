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
 * paiement intégré directement ici : une inscription payante repasse par la page Cotisation,
 * même principe que le panier boutique qui renvoie vers son propre flux de paiement.
 *
 * Changé le 2026-09-20 (retour utilisateur : "Wenn ich auf 'Confirmer et payer' clicke, ich
 * soll direkt zur Zahlung springen") : "Confirmer et payer" (modale ci-dessus, quand
 * l'inscription créée est payante) ET le bouton "Payer maintenant" de l'onglet "Mes
 * inscriptions" naviguent maintenant directement vers `/cotisation?paiement=<cotisationId>` —
 * la Cotisation déjà créée côté serveur pour CETTE inscription (voir `Inscription.cotisation`,
 * apps.evenements.services.synchroniser_cotisation) — au lieu de renvoyer vers `/cotisation`
 * sans contexte, ce qui obligeait jusqu'ici à rebasculer manuellement sur l'onglet "Mes
 * souscriptions"/"Mes inscriptions" pour retrouver ce paiement (voir docstring de tête de
 * CotisationStepperPage.tsx pour le comportement du lien direct).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AnimatedProgress from "../../components/ui/AnimatedProgress";
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

function ModaleInscription({
  evenement,
  onClose,
  onPayer,
}: {
  evenement: Evenement;
  onClose: () => void;
  onPayer: (cotisationId: string) => void;
}) {
  const { t } = useTranslation("evenements");
  const inscrire = useInscrire();
  const [places, setPlaces] = useState(1);
  const [accompagnantsAdultes, setAccompagnantsAdultes] = useState(0);
  const [accompagnantsEnfants, setAccompagnantsEnfants] = useState(0);
  const [regime, setRegime] = useState<RegimeAlimentaire>("aucun");
  const [remarques, setRemarques] = useState("");
  const [erreur, setErreur] = useState("");

  const maxPlaces =
    evenement.places_restantes !== null ? Math.min(4, Math.max(evenement.places_restantes, 1)) : 4;
  const maxAccompagnants =
    evenement.places_restantes !== null ? Math.max(evenement.places_restantes - places, 0) : 8;

  // Estimation affichée à titre purement indicatif — le montant réel est toujours recalculé et
  // vérifié côté serveur, jamais fait confiance au frontend (CLAUDE.md §8).
  const montantEstime =
    Number(evenement.gratuit ? 0 : evenement.cout) * places +
    (evenement.accompagnants_payants
      ? Number(evenement.prix_accompagnant_adulte) * accompagnantsAdultes +
        Number(evenement.prix_accompagnant_enfant) * accompagnantsEnfants
      : 0);

  function confirmer() {
    inscrire.mutate(
      {
        evenement: evenement.id,
        places,
        nombre_accompagnants_adultes: accompagnantsAdultes,
        nombre_accompagnants_enfants: accompagnantsEnfants,
        regime_alimentaire: regime,
        remarques,
      },
      {
        onSuccess: (inscription) => {
          onClose();
          // Ajouté le 2026-09-20 (retour utilisateur : "Wenn ich auf 'Confirmer et payer'
          // clicke, ich soll direkt zur Zahlung springen") — une inscription gratuite ou déjà
          // confirmée n'a pas de Cotisation liée (voir apps.evenements.services.
          // synchroniser_cotisation, statut EN_ATTENTE_PAIEMENT uniquement) : dans ce cas on se
          // contente de fermer la modale, comme avant.
          if (inscription.cotisation) {
            onPayer(inscription.cotisation);
          }
        },
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
              {montantEstime > 0 ? formatMontant(montantEstime) : t("gratuit")}
            </div>
            <div className="text-[10px] text-text-tertiary">{t("modal_montant_estime")}</div>
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

        {/* Begleitpersonen (module "Veranstaltungsverwaltung", 2026-09-25) — décomptes par
            palier adulte/enfant, jamais l'âge exact de chaque accompagnant (la limite d'âge
            n'est ici qu'une indication pour aider le membre à choisir le bon palier). */}
        <div className="mb-2 rounded-cid bg-bg-secondary p-2.5">
          <div className="mb-1.5 text-xs font-medium text-text-secondary">
            {t("modal_accompagnants_titre")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="modal-inscription-accompagnants-adultes"
                className="mb-1 block text-[11px] text-text-tertiary"
              >
                {t("modal_accompagnants_adultes")}
                {evenement.accompagnants_payants &&
                  ` (${formatMontant(evenement.prix_accompagnant_adulte)})`}
              </label>
              <input
                id="modal-inscription-accompagnants-adultes"
                type="number"
                min={0}
                max={maxAccompagnants}
                value={accompagnantsAdultes}
                onChange={(e) =>
                  setAccompagnantsAdultes(
                    Math.max(0, Math.min(maxAccompagnants, Number(e.target.value) || 0)),
                  )
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="modal-inscription-accompagnants-enfants"
                className="mb-1 block text-[11px] text-text-tertiary"
              >
                {t("modal_accompagnants_enfants", {
                  age: evenement.age_limite_accompagnant_enfant,
                })}
                {evenement.accompagnants_payants &&
                  ` (${formatMontant(evenement.prix_accompagnant_enfant)})`}
              </label>
              <input
                id="modal-inscription-accompagnants-enfants"
                type="number"
                min={0}
                max={maxAccompagnants}
                value={accompagnantsEnfants}
                onChange={(e) =>
                  setAccompagnantsEnfants(
                    Math.max(0, Math.min(maxAccompagnants, Number(e.target.value) || 0)),
                  )
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          {!evenement.accompagnants_payants && (
            <p className="mt-1 text-[10px] text-text-tertiary">
              {t("modal_accompagnants_gratuits")}
            </p>
          )}
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
            {montantEstime > 0 ? t("modal_confirmer_payer") : t("modal_confirmer")}
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
    <div ref={cardRef} className="overflow-hidden rounded-cid-lg bg-card-gradient shadow-card">
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
            {/* AnimatedProgress reprise de MyCID (merge de design 2026-09-25, voir ProjetCard) —
                même animation d'entrée dans le viewport que la barre de collecte des projets. */}
            <AnimatedProgress value={remplissage} />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
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
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      inscription.statut === "confirmee"
                        ? "bg-status-successBg text-status-successText"
                        : inscription.statut === "en_attente_paiement"
                          ? "bg-status-warningBg text-status-warningText"
                          : "bg-bg-tertiary text-text-tertiary"
                    }`}
                  >
                    {t(`inscription_statut_${inscription.statut}`)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {inscription.statut === "en_attente_paiement" && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        inscription.cotisation
                          ? `/cotisation?paiement=${inscription.cotisation}`
                          : "/cotisation",
                      )
                    }
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
          onPayer={(cotisationId) => navigate(`/cotisation?paiement=${cotisationId}`)}
        />
      )}
    </div>
  );
}
