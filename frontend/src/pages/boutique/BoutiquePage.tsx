/**
 * Page membre "Boutique" (mockup #pg-boutique, FDD §3.4) — point d'entrée unique du module côté
 * membre depuis le 2026-09-23 (retour utilisateur : "'Meine Bestellungen' und 'Meine Gutscheine'
 * in die Boutique verschieben") : les anciennes routes séparées `/boutique/commandes` et
 * `/boutique/bons-achat` (chacune avec sa propre entrée de sidebar) sont repliées ici en onglets,
 * pilotés par `?onglet=` plutôt que par des routes dédiées — même principe que AdminBoutiquePage
 * côté gestion, mais côté membre.
 *
 * Schéma d'URL (voir apps.boutique.notifications côté backend, `lien` déjà mis à jour en
 * conséquence) :
 *   - /boutique                              (catalogue, défaut — onglet omis de l'URL)
 *   - /boutique?onglet=commandes[&commande=<id>]
 *   - /boutique?onglet=bons_achat[&bon=<id>]
 *
 * Changer d'onglet nettoie le paramètre de deep-link de l'onglet quitté (`commande`/`bon`) —
 * sans quoi il resterait dans l'URL et re-déclencherait le highlight/scroll de useDeepLinkCible
 * si l'utilisateur revient sur cet onglet plus tard sans y avoir été renvoyé par une notification.
 *
 * `/boutique/panier` (revue du panier + commande) reste une route séparée (bouton flottant
 * depuis le catalogue, voir CataloguePage) — hors de ce système d'onglets, comme avant.
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import CataloguePage from "./CataloguePage";
import MesBonsAchatPage from "./MesBonsAchatPage";
import MesCommandesPage from "./MesCommandesPage";

type Onglet = "catalogue" | "commandes" | "bons_achat";

function ongletDepuisParam(valeur: string | null): Onglet {
  return valeur === "commandes" || valeur === "bons_achat" ? valeur : "catalogue";
}

export default function BoutiquePage() {
  const { t } = useTranslation("boutique");
  const [searchParams, setSearchParams] = useSearchParams();
  const onglet = ongletDepuisParam(searchParams.get("onglet"));

  function changerOnglet(cible: Onglet) {
    const next = new URLSearchParams(searchParams);
    if (cible === "catalogue") {
      next.delete("onglet");
    } else {
      next.set("onglet", cible);
    }
    // Ne garder `commande`/`bon` que sur leur propre onglet (voir docstring) — un changement
    // manuel d'onglet n'est plus le suivi d'une notification.
    if (cible !== "commandes") next.delete("commande");
    if (cible !== "bons_achat") next.delete("bon");
    setSearchParams(next);
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        <button
          type="button"
          onClick={() => changerOnglet("catalogue")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "catalogue"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("boutique_page.onglet_catalogue")}
        </button>
        <button
          type="button"
          onClick={() => changerOnglet("commandes")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "commandes"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("boutique_page.onglet_commandes")}
        </button>
        <button
          type="button"
          onClick={() => changerOnglet("bons_achat")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "bons_achat"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("boutique_page.onglet_bons_achat")}
        </button>
      </div>

      {onglet === "catalogue" && <CataloguePage />}
      {onglet === "commandes" && <MesCommandesPage />}
      {onglet === "bons_achat" && <MesBonsAchatPage />}
    </div>
  );
}
