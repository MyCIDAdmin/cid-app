/**
 * „Neu im Shop“ der Startseite nach der Anmeldung (Vorschlag B, 2026-11) : bis zu drei veröffentlichte
 * Artikel, Neuheiten zuerst. Der angezeigte Preis ist der vom Server aufgelöste `prix_affiche`
 * (Mitgliederpreis oder Normalpreis), nie ein im Browser berechneter Wert. Ohne Artikel oder bei
 * geschlossenem Modul „Shop“ erscheint nichts.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProduits } from "../../hooks/useBoutique";
import { useModuleOuvert } from "../../hooks/useRbac";
import { formatBetrag } from "../../utils/partner";
import { uebersetzt } from "../../utils/uebersetzung";
import { waehleArtikel } from "../../utils/startseite";

function Raster() {
  const { t, i18n } = useTranslation("public");
  const { data } = useProduits();
  const artikel = waehleArtikel([...(data?.results ?? [])]);
  if (artikel.length === 0) return null;

  return (
    <section
      aria-labelledby="shop-titel"
      className="h-full rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="shop-titel" className="font-display text-lg font-bold text-text-primary">
          {t("startseite.shop.titel")}
        </h2>
        <Link
          to="/boutique"
          className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-semibold text-text-primary hover:border-ca"
        >
          {t("startseite.shop.zum_shop")} →
        </Link>
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {artikel.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link
              to={`/boutique/${p.id}`}
              className="block overflow-hidden rounded-cid-lg border border-text-tertiary/15 transition hover:border-ca/40"
            >
              <div className="relative grid h-24 place-items-center bg-gradient-to-br from-ca to-cad font-display text-2xl font-bold text-white">
                {p.image ? (
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  uebersetzt(p, "nom").slice(0, 1).toUpperCase()
                )}
                {p.nouveaute && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-ca">
                    {t("startseite.shop.neu")}
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-sm font-bold text-text-primary">
                  {uebersetzt(p, "nom")}
                </div>
                <div className="text-xs text-text-tertiary">
                  {formatBetrag(p.prix_affiche, i18n.language)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ShopNeuheiten() {
  const { ouvert } = useModuleOuvert("boutique");
  if (!ouvert) return null;
  return <Raster />;
}
