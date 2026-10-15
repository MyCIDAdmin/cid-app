/**
 * Wettbewerb der Regionen (Release 30) : Rangliste (Punkte pro Mitglied und Gesamtpunkte),
 * Abzeichen, Verlauf, Monatssieger, Preis und Regeln. Offen für jedes Konto (auch Fans) ; nur
 * Regionen werden gewertet, keine Einzelpersonen. Büro und App Admin sehen zusätzlich Journal,
 * Korrekturen bzw. Saisons und Regeln.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import WettbewerbAdmin from "../../components/regionen/WettbewerbAdmin";
import WettbewerbBuero from "../../components/regionen/WettbewerbBuero";
import WettbewerbRangliste from "../../components/regionen/WettbewerbRangliste";
import WettbewerbVerlauf from "../../components/regionen/WettbewerbVerlauf";
import { useWettbewerb } from "../../hooks/useRegionen";

function datum(iso: string, sprache: string): string {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t).toLocaleDateString(sprache);
}

export default function WettbewerbPage() {
  const { t, i18n } = useTranslation("regionen");
  const [saisonId, setSaisonId] = useState<string | undefined>();
  const { data, isLoading, isError } = useWettbewerb(saisonId);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("wettbewerb.fehler_laden")}</p>;
  }
  const { saison, regeln } = data;
  const namen = Object.fromEntries(data.rangliste.map((z) => [z.region.slug, z.region.name]));
  const monat = (m: string) => {
    const [j, mm] = m.split("-").map(Number);
    return new Date(j, mm - 1, 1).toLocaleDateString(i18n.language, {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/regionen" className="text-xs font-medium text-ca hover:underline">
          ← {t("zurueck")}
        </Link>
        <h1 className="mt-1 text-xl font-bold text-text-primary">{t("wettbewerb.titel")}</h1>
        <p className="text-sm text-text-secondary">{t("wettbewerb.einleitung")}</p>
      </div>

      {data.saisons.length > 1 && (
        <label className="text-xs font-semibold text-text-tertiary">
          {t("wettbewerb.saison")}
          <select
            className="mt-1 block w-full max-w-xs rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm font-normal text-text-primary"
            value={saison?.id ?? ""}
            onChange={(e) => setSaisonId(e.target.value)}
          >
            {data.saisons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!saison && (
        <p className="rounded-cid bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
          {t("wettbewerb.keine_saison")}
        </p>
      )}

      {saison && (
        <>
          <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-text-primary">{saison.name}</h2>
              <span className="text-xs text-text-tertiary">
                {datum(saison.start, i18n.language)} – {datum(saison.ende, i18n.language)}
              </span>
              {saison.eingefroren && (
                <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-semibold text-text-secondary">
                  {t("wettbewerb.status_eingefroren")}
                </span>
              )}
            </div>
            {saison.preis && (
              <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{t("wettbewerb.preis")}: </span>
                {saison.preis}
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-text-primary">
              {t("wettbewerb.rangliste")}
            </h2>
            <WettbewerbRangliste zeilen={data.rangliste} />
            <p className="mt-2 text-xs text-text-tertiary">{t("wettbewerb.rangliste_hinweis")}</p>
          </section>

          <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-text-primary">
              {t("wettbewerb.verlauf")}
            </h2>
            <WettbewerbVerlauf verlauf={data.verlauf} />
          </section>

          {data.monatssieger.length > 0 && (
            <section>
              <h2 className="mb-2 text-base font-semibold text-text-primary">
                {t("wettbewerb.monatssieger")}
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                {data.monatssieger.map((s) => (
                  <li key={s.monat}>
                    <span className="font-medium text-text-primary">{monat(s.monat)}: </span>
                    {s.regionen.map((slug) => namen[slug] ?? slug).join(", ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-text-primary">{t("wettbewerb.regeln")}</h2>
        <ul className="flex flex-col gap-1 text-sm text-text-secondary">
          <li>{t("wettbewerb.regel_treffen", { punkte: regeln.punkte_veranstaltung })}</li>
          <li>
            {t("wettbewerb.regel_anwesend", {
              punkte: regeln.punkte_anwesend,
              max: regeln.max_anwesende,
            })}
          </li>
          <li>{t("wettbewerb.regel_erst", { punkte: regeln.punkte_erstteilnehmer })}</li>
          <li>{t("wettbewerb.regel_neumitglied", { punkte: regeln.punkte_neumitglied })}</li>
          <li>{t("wettbewerb.regel_monat", { max: regeln.max_treffen_monat })}</li>
          <li>{t("wettbewerb.regel_abschluss")}</li>
        </ul>
        <h3 className="mb-1 mt-3 text-sm font-semibold text-text-primary">
          {t("wettbewerb.abzeichen_titel")}
        </h3>
        <ul className="flex flex-col gap-1 text-sm text-text-secondary">
          {(["erstes_treffen", "zehn_treffen", "fleissigste_region"] as const).map((k) => (
            <li key={k}>
              <span className="font-medium text-text-primary">
                {t(`wettbewerb.abzeichen.${k}`)}:{" "}
              </span>
              {t(`wettbewerb.abzeichen_erklaerung.${k}`)}
            </li>
          ))}
        </ul>
      </section>

      {data.ewige_tabelle.length > 0 && (
        <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            {t("wettbewerb.ewige_tabelle")}
          </h2>
          <ol className="flex flex-col gap-1 text-sm text-text-secondary">
            {data.ewige_tabelle.map((z, i) => (
              <li key={z.region.slug} className="flex items-center justify-between gap-2">
                <span>
                  <span className="mr-2 tabular-nums text-text-tertiary">{i + 1}.</span>
                  <span className="font-medium text-text-primary">{z.region.name}</span>
                </span>
                <span className="tabular-nums">
                  {z.punkte} · {t("wettbewerb.saisons_zahl", { count: z.saisons })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.darf_verwalten && saison && (
        <WettbewerbBuero saison={saison} regionen={data.rangliste.map((z) => z.region)} />
      )}
      {data.ist_admin && <WettbewerbAdmin saisons={data.saisons} regeln={regeln} />}
    </div>
  );
}
