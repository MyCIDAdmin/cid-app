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
import MapsApercu from "../../components/ui/MapsApercu";
import ShareButton from "../../components/ui/ShareButton";
import ModaleInscription, {
  formatDate,
  formatMontant,
} from "../../components/evenements/ModaleInscription";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import { useAnnulerInscription, useEvenements, useInscriptions } from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Evenement } from "../../types/evenements";

type Onglet = "avenir" | "passes" | "inscrits";

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  // Vorschau + Adresse (retour utilisateur du 2026-09-27, point 11.2.2) — jusqu'ici seule
  // ModaleInscription (ouverte uniquement en cliquant "S'inscrire") affichait MapsApercu ;
  // l'adresse en texte était bien sur la carte, mais jamais la vignette de carte elle-même ni le
  // lien "Ouvrir dans Google Maps", d'où le "Weitere Details immer noch nicht im Modul
  // Veranstaltungen" du retour utilisateur. Repliée par défaut (plutôt qu'un iframe Google Maps
  // par carte chargé d'office, potentiellement plusieurs dizaines sur cette page) — un simple
  // bouton la déplie à la demande, MapsApercu ne rendant de toute façon rien si `lieu` est vide.
  const [carteOuverte, setCarteOuverte] = useState(false);
  const remplissage =
    evenement.places_max !== null
      ? Math.min(100, Math.round((evenement.places_reservees / evenement.places_max) * 100))
      : null;
  const complet = evenement.places_restantes !== null && evenement.places_restantes <= 0;

  return (
    <div ref={cardRef} className="overflow-hidden rounded-cid-lg bg-card-gradient shadow-card">
      {/* Bannière + description en aperçu (retour utilisateur du 2026-09-28, points 2.1/2.2 :
          "Beschreibung und Details ... soll Attraktiv ... dargestellt werden" / "Das
          Hochgeladene Bild soll als Banner ... angezeigt werden. Genau wie bei den
          Veranstalltungen in der Startseite.") — même Kachel-Stil que EvenementKachel
          (PublicEvenementsTab.tsx, page d'accueil publique) : image de fond en bannière (repli
          dégradé bg-ca→bg-cad tant qu'aucune image n'a été téléversée), overlay dégradé pour
          garder titre/pastille de date lisibles, et description (HTML de l'éditeur riche,
          jamais retapée côté client) tronquée à 2 lignes juste en dessous. */}
      <div
        className="relative flex h-28 flex-col justify-end bg-gradient-to-br from-ca to-cad bg-cover bg-center p-3"
        style={evenement.image ? { backgroundImage: `url(${evenement.image})` } : undefined}
      >
        {evenement.image && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        )}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ca">
            {formatDate(evenement.date_evenement)}
          </span>
          <ShareButton
            path={`/evenements?evenement=${evenement.id}`}
            titre={evenement.titre}
            texte={`${evenement.titre} — ${formatDate(evenement.date_evenement)}, ${evenement.lieu}`}
            variant="inverse"
          />
        </div>
        <h3 className="relative z-10 pr-16 text-base font-bold text-white">{evenement.titre}</h3>
      </div>
      <div className="space-y-2 p-3">
        {evenement.description && (
          <div
            className="line-clamp-2 text-xs text-text-tertiary"
            dangerouslySetInnerHTML={{ __html: evenement.description }}
          />
        )}
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

        {evenement.lieu.trim() && (
          <button
            type="button"
            onClick={() => setCarteOuverte((v) => !v)}
            className="text-xs font-medium text-ca hover:underline"
          >
            {carteOuverte ? t("carte_masquer") : t("carte_afficher")}
          </button>
        )}
        {carteOuverte && (
          <MapsApercu adresse={evenement.lieu} mapsUrl={evenement.lieu_maps_url} />
        )}

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
