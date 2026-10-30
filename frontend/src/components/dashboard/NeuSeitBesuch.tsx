/**
 * „Neu seit deinem letzten Besuch“ : eine waagerechte Reihe mit den neuesten Beiträgen und den
 * nächsten Veranstaltungen. Den Zeitpunkt des letzten Besuchs merkt sich nur dieser Browser; was
 * danach entstanden ist, trägt einen Punkt.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";
import type { Publication } from "../../types/communaute";
import type { Evenement } from "../../types/evenements";
import { apercuTexteDepuisHtml } from "../../utils/html";

interface Karte {
  id: string;
  art: "beitrag" | "termin";
  titel: string;
  zeile: string;
  link: string;
  neu: boolean;
}

function besuchLesen(schluessel: string): number {
  try {
    return Number(window.localStorage.getItem(schluessel)) || 0;
  } catch {
    return 0;
  }
}

export default function NeuSeitBesuch({
  publikationen,
  veranstaltungen,
}: {
  publikationen: Publication[];
  veranstaltungen: Evenement[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const user = useAuthStore((s) => s.user);
  const schluessel = `uebersicht:besuch:${user?.id ?? "anonym"}`;
  const [letzter] = useState(() => besuchLesen(schluessel));
  useEffect(() => {
    try {
      window.localStorage.setItem(schluessel, String(Date.now()));
    } catch {
      /* Speicher gesperrt : dann gibt es eben keine Punkte beim nächsten Mal. */
    }
  }, [schluessel]);

  const datum = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: "2-digit", month: "short" });
  const karten: Karte[] = [
    ...publikationen.map<Karte>((p) => ({
      id: `p${p.id}`,
      art: "beitrag",
      titel: apercuTexteDepuisHtml(p.contenu, 70),
      zeile: `${p.auteur.prenom} ${p.auteur.nom}`,
      link: "/fil",
      neu: letzter > 0 && new Date(p.created_at).getTime() > letzter,
    })),
    ...veranstaltungen.map<Karte>((e) => ({
      id: `e${e.id}`,
      art: "termin",
      titel: e.titre,
      zeile: `${datum(e.date_evenement)}${e.lieu ? ` · ${e.lieu}` : ""}`,
      link: "/evenements",
      neu: letzter > 0 && new Date(e.created_at).getTime() > letzter,
    })),
  ];
  if (karten.length === 0) return null;

  return (
    <section
      aria-label={t("uebersicht.neu.titel")}
      className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="neu-seit-besuch"
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t("uebersicht.neu.titel")}
      </h2>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {karten.map((k) => (
          <li key={k.id} className="w-52 shrink-0 snap-start">
            <Link
              to={k.link}
              className="block overflow-hidden rounded-cid-lg border border-bg-tertiary bg-bg-primary transition-shadow hover:shadow-md"
            >
              <span
                className={`relative flex h-20 items-end p-2 text-[11px] font-bold text-white ${
                  k.art === "beitrag"
                    ? "bg-gradient-to-br from-ca to-[#7a070b]"
                    : "bg-gradient-to-br from-[#eb6834] to-[#a3380f]"
                }`}
              >
                <span className="rounded-full bg-white/25 px-2 py-0.5">
                  {t(`uebersicht.neu.art_${k.art}`)}
                </span>
                {k.neu && (
                  <span
                    className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-white ring-4 ring-white/30"
                    role="img"
                    aria-label={t("uebersicht.neu.neu")}
                  />
                )}
              </span>
              <span className="block p-3">
                <span className="block text-sm font-semibold leading-snug text-text-primary">
                  {k.titel}
                </span>
                <span className="text-xs text-text-secondary">{k.zeile}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
