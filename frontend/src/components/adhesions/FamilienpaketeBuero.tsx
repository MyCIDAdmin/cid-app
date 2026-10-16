/** Büro-Übersicht der Familienpakete (R35): Hauptperson, Gesamtpreis und Rabatt, jede Person mit
 * Beziehung, Einladungsstatus und zugewiesenem Angebot (mit Schreibrecht änderbar). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFamilienpakete, usePersonAngebot } from "../../hooks/useAdhesions";
import type { CampagneAdhesion, FamilienpaketPerson } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatEuro } from "./familienpreis";

function AngebotWahl({
  typ,
  person,
  angebote,
  modifiable,
}: {
  typ: "kind" | "erwachsener";
  person: FamilienpaketPerson;
  angebote: CampagneAdhesion["offres"];
  modifiable: boolean;
}) {
  const { t } = useTranslation("adhesions");
  const zuweisen = usePersonAngebot();
  if (!modifiable) return <span>{person.angebot ?? "—"}</span>;
  return (
    <>
      <select
        aria-label={t("familie_buero.angebot_zuweisen", { name: person.name })}
        value={person.angebot_id ?? ""}
        disabled={zuweisen.isPending}
        onChange={(e) => zuweisen.mutate({ typ, id: person.id, angebot: e.target.value })}
        className="rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
      >
        {!person.angebot_id && <option value="">—</option>}
        {angebote.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom}
          </option>
        ))}
      </select>
      {zuweisen.isError && (
        <div className="text-status-dangerText">
          {extractApiErrorMessage(zuweisen.error, t("familie.erreur"))}
        </div>
      )}
    </>
  );
}

export default function FamilienpaketeBuero({
  campagnen,
  modifiable = false,
}: {
  campagnen: CampagneAdhesion[];
  modifiable?: boolean;
}) {
  const { t } = useTranslation("adhesions");
  const [campagneId, setCampagneId] = useState(campagnen[0]?.id ?? "");
  const query = useFamilienpakete(campagneId || undefined);
  const daten = query.data;
  const angebote = (campagnen.find((c) => c.id === campagneId)?.offres ?? []).filter(
    (o) => !o.ist_familienpaket,
  );

  return (
    <section className="mt-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-xs font-bold text-text-primary">{t("familie_buero.titel")}</h2>
        <select
          aria-label={t("familie_buero.kampagne")}
          value={campagneId}
          onChange={(e) => setCampagneId(e.target.value)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        >
          {campagnen.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      {query.isLoading && (
        <p className="mt-2 text-sm text-text-tertiary">{t("admin.chargement")}</p>
      )}
      {query.isError && (
        <p className="mt-2 text-sm text-status-dangerText">{t("familie_buero.fehler")}</p>
      )}
      {daten && (
        <>
          <p className="mt-2 text-sm text-text-secondary">
            {t("familie_buero.zusammenfassung", {
              pakete: daten.zusammenfassung.pakete_bezahlt,
              angenommen: daten.zusammenfassung.erwachsene_angenommen,
              offen: daten.zusammenfassung.erwachsene_offen,
              konflikt: daten.zusammenfassung.erwachsene_konflikt,
              kinder: daten.zusammenfassung.kinder_eingetragen,
            })}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("familie_buero.rabatt_zusammenfassung", {
              liste: formatEuro(daten.zusammenfassung.listenpreis_gesamt),
              gezahlt: formatEuro(daten.zusammenfassung.gezahlt_gesamt),
              rabatt: formatEuro(daten.zusammenfassung.familienrabatt_gesamt),
            })}
          </p>
          {daten.pakete.length === 0 ? (
            <p className="mt-2 text-sm text-text-tertiary">{t("familie_buero.leer")}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                    <th className="py-1">{t("familie_buero.hauptperson")}</th>
                    <th className="py-1">{t("historique.col_statut")}</th>
                    <th className="py-1">{t("familie_buero.preis")}</th>
                    <th className="py-1">{t("familie_buero.personen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {daten.pakete.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-text-tertiary/10 align-top last:border-0"
                    >
                      <td className="py-1">
                        {p.hauptperson}
                        <div className="text-text-tertiary">{p.numero_membre}</div>
                        <div className="text-text-tertiary">
                          {p.hauptperson_angebot ?? p.angebot}
                        </div>
                      </td>
                      <td className="py-1">{t(`statut.${p.statut}`)}</td>
                      <td className="py-1">
                        {formatEuro(p.gesamtpreis)}
                        <div className="text-text-tertiary">
                          {t("familie_buero.liste_rabatt", {
                            liste: formatEuro(p.listenpreis),
                            pct: Number(p.rabatt_pct),
                          })}
                        </div>
                      </td>
                      <td className="py-1">
                        <ul className="space-y-1">
                          {p.erwachsene.map((e) => (
                            <li key={e.id}>
                              {e.name} · {t(`familie.beziehung_${e.beziehung}`)} ·{" "}
                              <strong>{t(`familie.status_${e.status}`)}</strong>
                              <div className="text-text-tertiary">{e.email}</div>
                              <AngebotWahl
                                typ="erwachsener"
                                person={e}
                                angebote={angebote}
                                modifiable={modifiable}
                              />{" "}
                              <span className="text-text-tertiary">
                                {formatEuro(e.preis_anteil)}
                              </span>
                            </li>
                          ))}
                          {p.kinder.map((k) => (
                            <li key={k.id}>
                              {k.name} ({t("familie.alter", { alter: k.alter })}) ·{" "}
                              {t(`familie.beziehung_${k.beziehung}`)}
                              <div>
                                <AngebotWahl
                                  typ="kind"
                                  person={k}
                                  angebote={angebote}
                                  modifiable={modifiable}
                                />{" "}
                                <span className="text-text-tertiary">
                                  {formatEuro(k.preis_anteil)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {modifiable && (
            <p className="mt-2 text-[11px] text-text-tertiary">
              {t("familie_buero.zuweisung_hinweis")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
