/**
 * „Regionen-Arena“ der Startseite nach der Anmeldung (Vorschlag B, 2026-11) : die Regionen des
 * Wettbewerbs als Karten, umschaltbar zwischen Punkten je Mitglied und Gesamtpunkten. Die Zahlen
 * kommen unverändert aus dem Wettbewerb (useWettbewerb) ; es gibt keine eigene Berechnung.
 * Ohne laufende Saison, ohne Regionen oder bei geschlossenem Modul „Sektoren“ erscheint nichts.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useModuleOuvert } from "../../hooks/useRbac";
import { useWettbewerb } from "../../hooks/useRegionen";
import type { RanglisteZeile } from "../../types/regionen";
import { sortiereRegionen, type ArenaSortierung } from "../../utils/startseite";

function Pokal() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-ca"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

function Arena() {
  const { t, i18n } = useTranslation("public");
  const [sortierung, setSortierung] = useState<ArenaSortierung>("pro_mitglied");
  const { data } = useWettbewerb();
  const zeilen = useMemo(
    () => sortiereRegionen(data?.rangliste ?? [], sortierung),
    [data, sortierung],
  );
  if (!data?.saison || zeilen.length === 0) return null;

  const zahl = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const wertVon = (z: RanglisteZeile) =>
    sortierung === "pro_mitglied" ? z.punkte_pro_mitglied : z.punkte;
  const maximum = Math.max(...zeilen.map(wertVon), 1);
  const letzterSieg = [...data.monatssieger].reverse().find((m) => m.regionen.length > 0);
  const monatsname = letzterSieg
    ? new Date(`${letzterSieg.monat}-01T12:00:00`).toLocaleDateString(i18n.language, {
        month: "long",
      })
    : "";
  const optionen: { wert: ArenaSortierung; label: string }[] = [
    { wert: "pro_mitglied", label: t("startseite.arena.pro_mitglied") },
    { wert: "gesamt", label: t("startseite.arena.gesamt") },
  ];

  return (
    <section
      aria-labelledby="arena-titel"
      className="rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="arena-titel"
            className="flex items-center gap-2 font-display text-lg font-bold text-text-primary"
          >
            <Pokal />
            {t("startseite.arena.titel")}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {t("startseite.arena.untertitel", { saison: data.saison.name })}
            {data.saison.preis
              ? ` · ${t("startseite.arena.preis", { preis: data.saison.preis })}`
              : ""}
          </p>
        </div>
        <div
          role="group"
          aria-label={t("startseite.arena.sortierung")}
          className="flex gap-1 rounded-full border border-text-tertiary/20 p-0.5 text-xs"
        >
          {optionen.map((o) => (
            <button
              key={o.wert}
              type="button"
              aria-pressed={sortierung === o.wert}
              onClick={() => setSortierung(o.wert)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                sortierung === o.wert
                  ? "bg-ca text-white"
                  : "text-text-secondary hover:bg-bg-tertiary"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {zeilen.map((z, index) => (
          <li key={z.region.slug}>
            <Link
              to={`/regionen/${z.region.slug}`}
              style={{ borderTopColor: z.region.farbe }}
              className="relative block h-full rounded-cid-lg border border-text-tertiary/15 border-t-4 bg-bg-secondary p-3 transition hover:border-ca/40"
            >
              <span
                aria-label={t("startseite.arena.platz", { platz: index + 1 })}
                className={`absolute right-3 top-2 font-display text-xl font-bold ${
                  index === 0 ? "text-status-warningText" : "text-text-tertiary"
                }`}
              >
                {index + 1}.
              </span>
              <span className="block pr-8 text-sm font-bold text-text-primary">
                {z.region.name}
              </span>
              <span className="mt-1 block font-display text-2xl font-bold tabular-nums text-text-primary">
                {zahl(wertVon(z))}
              </span>
              <span className="block text-[11px] text-text-tertiary">
                {sortierung === "pro_mitglied"
                  ? t("startseite.arena.punkte_je_mitglied")
                  : t("startseite.arena.punkte_gesamt")}
              </span>
              <span
                aria-hidden="true"
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-bg-tertiary"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((wertVon(z) / maximum) * 100)}%`,
                    backgroundColor: z.region.farbe,
                  }}
                />
              </span>
              <span className="mt-1.5 block text-[11px] text-text-tertiary">
                {t("startseite.arena.mitglieder_treffen", {
                  mitglieder: z.mitglieder,
                  treffen: z.treffen,
                })}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-cid-lg bg-ca/10 px-3 py-2 text-sm">
        <Pokal />
        {letzterSieg && (
          <span className="text-text-primary">
            <strong>{t("startseite.arena.fleissigste", { monat: monatsname })}</strong>{" "}
            {letzterSieg.regionen.join(", ")}
          </span>
        )}
        <Link
          to="/regionen/wettbewerb"
          className="ml-auto rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-1 text-xs font-semibold text-text-primary hover:border-ca"
        >
          {t("startseite.arena.zur_rangliste")} →
        </Link>
      </div>
    </section>
  );
}

export default function RegionenArena() {
  const { ouvert } = useModuleOuvert("regionen");
  if (!ouvert) return null;
  return <Arena />;
}
