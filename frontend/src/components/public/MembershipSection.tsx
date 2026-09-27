/**
 * Section adhésion de l'onglet "Startseite" (demande utilisateur du 2026-09-26, plan
 * "Öffentliche mycid.org-Startseite" section C.2) — bascule entre les deux rendus décidés par
 * l'utilisateur :
 *   - pas encore membre (visiteur anonyme, OU connecté sans souscription payée pour la
 *     campagne active) → cartes d'offres façon mycid.org/membership (MembershipOffersPublic) ;
 *   - déjà membre (souscription payée pour la campagne active) → récapitulatif condensé des
 *     "éléments actuels" de /mon-adhesion (offre souscrite + avantages), jamais le formulaire de
 *     gestion complet — un lien renvoie vers /mon-adhesion pour l'historique/le retrait/etc.
 *
 * "Déjà membre" est déterminé ici par la souscription elle-même (statut "payee"), PAS par
 * Membre.statut_membre : HomeRoute.tsx redirige déjà tout membre au statut "actif" vers
 * /dashboard avant même d'atteindre cette page (voir sa docstring) — cette page n'est donc
 * jamais vue par un membre pleinement actif. Le cas "déjà payée mais pas encore actif" reste
 * possible (ex. activation du statut décalée) et c'est précisément ce que cette branche couvre.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCampagneActive, useMesSouscriptions } from "../../hooks/useAdhesions";
import { useAuthStore } from "../../store/authStore";
import MembershipOffersPublic from "./MembershipOffersPublic";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function MembershipSection() {
  const { t } = useTranslation("public");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const campagneActive = useCampagneActive();
  const mesSouscriptions = useMesSouscriptions({ enabled: isAuthenticated });

  const campagne = campagneActive.data;
  if (!campagne) return null;

  const souscriptionActuelle = isAuthenticated
    ? mesSouscriptions.data?.results.find((s) => s.campagne === campagne.id)
    : undefined;
  const dejaMembre = souscriptionActuelle?.statut === "payee";

  if (!dejaMembre) {
    return <MembershipOffersPublic campagne={campagne} />;
  }

  const offreActuelle = campagne.offres.find((o) => o.id === souscriptionActuelle.offre);
  const avantages = souscriptionActuelle.snapshot_avantages
    .slice()
    .sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="rounded-cid-lg bg-ca p-6 text-white shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">
        {t("membership.deja_membre_titre")}
      </h2>
      <div className="mt-1 text-xl font-bold">{offreActuelle?.nom ?? "—"}</div>
      <div className="text-sm text-white/80">
        {t("membership.deja_membre_expire_le", { date: formatDate(campagne.date_fin) })}
      </div>

      {avantages.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {avantages.map((av) => (
            <span key={av.ordre} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
              ✓ {av.texte_fr}
            </span>
          ))}
        </div>
      )}

      <Link
        to="/mon-adhesion"
        className="mt-5 inline-block rounded-cid border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
      >
        {t("membership.gerer_lien")}
      </Link>
    </div>
  );
}
