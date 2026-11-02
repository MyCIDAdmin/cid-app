/** Ausgeklappte Einzelheiten einer Bestellung: Artikel, Lieferadresse und Verlauf. */
import { useTranslation } from "react-i18next";

import type { Commande } from "../../types/boutique";
import { lokaleSprache } from "../../utils/datum";

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString(lokaleSprache());
}

function betrag(wert: string): string {
  return `${Number(wert).toFixed(2).replace(".", ",")} €`;
}

export default function BestellDetails({ commande }: { commande: Commande }) {
  const { t } = useTranslation("boutique");
  const adresse = [
    commande.adresse_livraison,
    [commande.code_postal_livraison, commande.ville_livraison].filter(Boolean).join(" "),
    commande.pays_livraison,
  ].filter(Boolean);

  const verlauf: string[] = [
    t("bestellung.verlauf.bestellt", { datum: datum(commande.created_at) }),
  ];
  if (commande.date_paiement_confirme) {
    verlauf.push(
      t("bestellung.verlauf.bezahlt", {
        datum: datum(commande.date_paiement_confirme),
        art: commande.mode_paiement ? t(`paiement.mode.${commande.mode_paiement}`) : "",
      }),
    );
  }
  if (commande.date_expedition) {
    verlauf.push(t("bestellung.verlauf.versandt", { datum: datum(commande.date_expedition) }));
  }
  if (commande.retours.length > 0) {
    verlauf.push(t("bestellung.verlauf.ruecksendung", { count: commande.retours.length }));
  }

  return (
    <div className="mt-3 grid gap-4 border-t border-text-tertiary/10 pt-3 text-xs md:grid-cols-3">
      <div>
        <h3 className="mb-1 text-[10px] font-bold uppercase text-text-tertiary">
          {t("bestellung.artikel")}
        </h3>
        <ul className="space-y-0.5 text-text-secondary">
          {commande.lignes.map((l) => (
            <li key={l.id}>
              {l.quantite} × {l.produit_nom ?? t("bestellung.artikel_unbekannt")}
              {l.variante_label ? `, ${l.variante_label}` : ""}{" "}
              <b className="text-text-primary">{betrag(l.sous_total_net)}</b>
            </li>
          ))}
        </ul>
        {Number(commande.montant_bon_achat) > 0 && (
          <p className="mt-1 text-text-tertiary">
            {t("bestellung.gutschein_abgezogen", { betrag: betrag(commande.montant_bon_achat) })}
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-[10px] font-bold uppercase text-text-tertiary">
          {t("bestellung.lieferung")}
        </h3>
        {adresse.length > 0 ? (
          <address className="not-italic text-text-secondary">
            {commande.nom_destinataire}
            {adresse.map((z) => (
              <span key={z} className="block">
                {z}
              </span>
            ))}
          </address>
        ) : (
          <p className="text-text-tertiary">{t("bestellung.abholung")}</p>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-[10px] font-bold uppercase text-text-tertiary">
          {t("bestellung.verlauf.titel")}
        </h3>
        <ul className="space-y-0.5 text-text-secondary">
          {verlauf.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
