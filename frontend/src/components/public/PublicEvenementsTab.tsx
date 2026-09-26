/**
 * Onglet "Veranstaltungen" de la page d'accueil publique (Phase D, mycid.org/events, demande
 * utilisateur du 2026-09-26). Kachel-Stil (bannière dégradée + pastille date en superposition)
 * plutôt que la barre de titre compacte d'EvenementCarte (EvenementsPage, réservée aux membres
 * connectés) — mais réutilise EXACTEMENT la même modale d'inscription (ModaleInscription,
 * partagée depuis components/evenements/) pour ne jamais dupliquer la vérification de
 * capacité/accompagnants/régime alimentaire.
 *
 * Conserve les 3 sous-onglets d'EvenementsPage (Bevorstehend/Vergangen/Meine Anmeldungen —
 * demande utilisateur explicite) :
 *   - useEvenements() est appelé SANS distinction anonyme/authentifié : le backend
 *     (EvenementViewSet.get_queryset) filtre déjà tout seul — un visiteur anonyme ne voit que
 *     les événements PUBLIE + visible_public=True, un utilisateur authentifié (même non-actif)
 *     voit tout le catalogue publié comme un membre actif (voir docstring EvenementPermission
 *     côté backend). Rien à filtrer de plus ici.
 *   - "Meine Anmeldungen" : un visiteur complètement anonyme voit une invite de connexion à la
 *     place d'une liste vide ; un utilisateur authentifié (actif ou non) voit ses vraies
 *     inscriptions, exactement comme sur /evenements (useInscriptions n'est appelée qu'une fois
 *     connecté — voir `enabled`, useEvenements.ts).
 *   - S'inscrire : un visiteur anonyme est renvoyé vers /login (EvenementPermission réserve
 *     `inscrire` à un authentifié) ; un utilisateur authentifié ouvre directement
 *     ModaleInscription, comme sur /evenements.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import AnimatedProgress from "../ui/AnimatedProgress";
import ModaleInscription, { formatDate, formatMontant } from "../evenements/ModaleInscription";
import { useAnnulerInscription, useEvenements, useInscriptions } from "../../hooks/useEvenements";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Evenement } from "../../types/evenements";

type SousOnglet = "avenir" | "passes" | "inscrits";

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function EvenementKachel({
  evenement,
  passe,
  onInscrire,
}: {
  evenement: Evenement;
  passe: boolean;
  onInscrire: (evenement: Evenement) => void;
}) {
  const { t } = useTranslation("evenements");
  const remplissage =
    evenement.places_max !== null
      ? Math.min(100, Math.round((evenement.places_reservees / evenement.places_max) * 100))
      : null;
  const complet = evenement.places_restantes !== null && evenement.places_restantes <= 0;

  return (
    <div className="overflow-hidden rounded-cid-lg bg-bg-primary shadow-card">
      <div className="relative flex h-28 flex-col justify-end bg-gradient-to-br from-ca to-cad p-3">
        <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ca">
          {formatDate(evenement.date_evenement)}
        </span>
        <h3 className="pr-16 text-base font-bold text-white">{evenement.titre}</h3>
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-xs text-text-tertiary">{evenement.description}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
          {evenement.heure && <span>🕒 {evenement.heure.slice(0, 5)}</span>}
          <span>📍 {evenement.lieu}</span>
          <span>
            {evenement.places_max !== null
              ? t("places_sur_max", {
                  reservees: evenement.places_reservees,
                  max: evenement.places_max,
                })
              : t("places_illimitees")}
          </span>
        </div>

        {!passe && remplissage !== null && <AnimatedProgress value={remplissage} />}

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

function MesAnmeldungenSection() {
  const { t } = useTranslation("evenements");
  const { t: tPublic } = useTranslation("public");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [erreurAnnulation, setErreurAnnulation] = useState("");
  const inscriptionsQuery = useInscriptions({}, { enabled: isAuthenticated });
  const annulerInscription = useAnnulerInscription();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-cid-lg bg-bg-primary p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-text-primary">
          {tPublic("evenements_public.connexion_requise_titre")}
        </p>
        <p className="text-xs text-text-tertiary">
          {tPublic("evenements_public.connexion_requise_text")}
        </p>
        <Link
          to="/login"
          className="rounded-cid bg-ca px-4 py-2 text-xs font-medium text-white hover:bg-cad"
        >
          {tPublic("evenements_public.connexion_bouton")}
        </Link>
      </div>
    );
  }

  function annuler(id: string) {
    annulerInscription.mutate(id, {
      onError: (err) =>
        setErreurAnnulation(extractApiErrorMessage(err, t("inscriptions_erreur_annulation"))),
    });
  }

  return (
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
  );
}

export default function PublicEvenementsTab() {
  const { t } = useTranslation("evenements");
  const { t: tPublic } = useTranslation("public");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [sousOnglet, setSousOnglet] = useState<SousOnglet>("avenir");
  const [evenementInscription, setEvenementInscription] = useState<Evenement | null>(null);

  const today = useMemo(aujourdhuiISO, []);
  const avenirQuery = useEvenements({ statut: "publie", date_apres: today });
  const passesQuery = useEvenements({ statut: "publie", date_avant: today });

  // Un visiteur anonyme ne peut pas s'inscrire (EvenementPermission réserve `inscrire` à un
  // authentifié) — on l'envoie se connecter plutôt que d'ouvrir une modale vouée à échouer.
  function ouvrirInscription(evenement: Evenement) {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setEvenementInscription(evenement);
  }

  const requete = sousOnglet === "avenir" ? avenirQuery : passesQuery;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-text-primary">
          {tPublic("evenements_public.titre")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tPublic("evenements_public.sous_titre")}
        </p>
      </div>

      <div className="mb-6 flex justify-center gap-1 border-b border-text-tertiary/20">
        {(["avenir", "passes", "inscrits"] as const).map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => setSousOnglet(val)}
            className={`px-3 py-2 text-sm font-medium ${
              sousOnglet === val
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`tab_${val}`)}
          </button>
        ))}
      </div>

      {sousOnglet !== "inscrits" && (
        <>
          {requete.isLoading && <p className="text-sm text-text-tertiary">{t("chargement")}</p>}
          {requete.isError && (
            <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>
          )}
          {requete.data?.results.length === 0 && (
            <p className="text-sm text-text-tertiary">
              {sousOnglet === "avenir" ? t("aucun_evenement") : t("aucun_evenement_passe")}
            </p>
          )}
          <div className="grid gap-4 stagger-children sm:grid-cols-2 lg:grid-cols-3">
            {requete.data?.results.map((evenement) => (
              <EvenementKachel
                key={evenement.id}
                evenement={evenement}
                passe={sousOnglet === "passes"}
                onInscrire={ouvrirInscription}
              />
            ))}
          </div>
        </>
      )}

      {sousOnglet === "inscrits" && <MesAnmeldungenSection />}

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
