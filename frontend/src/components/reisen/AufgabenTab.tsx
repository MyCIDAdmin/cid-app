/** Reiter „Aufgaben“ : Aufgaben mit Verantwortlichem und Frist. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAufgabeAendern,
  useAufgabeAnlegen,
  useAufgabeLoeschen,
  useAufgaben,
  useTeilnehmer,
} from "../../hooks/useReisen";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datumKurz } from "../../utils/reisen";
import type { ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";
import ZielgruppeWahl, { GruppenChip } from "./ZielgruppeWahl";

export default function AufgabenTab({ reise }: { reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const q = useAufgaben(reise.id, reise.voll);
  const teilnehmer = useTeilnehmer(reise.id, reise.voll && reise.kann_verwalten);
  const anlegen = useAufgabeAnlegen(reise.id);
  const aendern = useAufgabeAendern(reise.id);
  const loeschen = useAufgabeLoeschen(reise.id);
  const meineId = useAuthStore((s) => s.user?.id);
  const [titel, setTitel] = useState("");
  const [wer, setWer] = useState("");
  const [frist, setFrist] = useState("");
  const [teilgruppe, setTeilgruppe] = useState("");
  const [fehler, setFehler] = useState("");
  const dabei = (teilnehmer.data ?? []).filter((x) => x.status === "dabei");

  function neu(ev: React.FormEvent) {
    ev.preventDefault();
    if (!titel.trim()) return;
    anlegen.mutate(
      { titel, verantwortlich: wer || null, frist: frist || null, teilgruppe: teilgruppe || null },
      {
        onSuccess: () => {
          setTitel("");
          setWer("");
          setFrist("");
          setTeilgruppe("");
          setFehler("");
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="space-y-3">
      {reise.kann_verwalten && (
        <form
          onSubmit={neu}
          className={`${KARTE} grid grid-cols-1 gap-2 sm:grid-cols-4`}
          aria-label={t("aufgaben.neu")}
        >
          <input
            className={`${FELD} sm:col-span-2`}
            aria-label={t("aufgaben.titel")}
            placeholder={t("aufgaben.titel")}
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
          />
          <select
            className={FELD}
            aria-label={t("aufgaben.verantwortlich")}
            value={wer}
            onChange={(e) => setWer(e.target.value)}
          >
            <option value="">{t("aufgaben.niemand")}</option>
            {dabei.map((x) => (
              <option key={x.user} value={x.user}>
                {x.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={FELD}
            aria-label={t("aufgaben.frist")}
            value={frist}
            onChange={(e) => setFrist(e.target.value)}
          />
          <div className="sm:col-span-4">
            <ZielgruppeWahl reiseId={reise.id} value={teilgruppe} onChange={setTeilgruppe} />
          </div>
          <div className="sm:col-span-4 flex items-center gap-2">
            <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
              {t("aufgaben.anlegen")}
            </button>
            <Fehler text={fehler} />
          </div>
        </form>
      )}
      {(q.data ?? []).length === 0 && !q.isLoading && (
        <p className="text-sm text-text-tertiary">{t("aufgaben.leer")}</p>
      )}
      <ul className="space-y-1.5">
        {(q.data ?? []).map((a) => {
          const meine = a.verantwortlich !== null && a.verantwortlich === meineId;
          const darfStatus = reise.kann_verwalten || meine;
          return (
            <li
              key={a.id}
              className={`${KARTE} flex flex-wrap items-center justify-between gap-2`}
              data-testid={`aufgabe-${a.id}`}
            >
              <div>
                <p
                  className={`text-sm ${a.status === "erledigt" ? "line-through text-text-tertiary" : "font-medium"}`}
                >
                  {a.titel} <GruppenChip name={a.teilgruppe_name} />
                </p>
                <p className={`text-xs ${a.ueberfaellig ? "text-red-600" : "text-text-secondary"}`}>
                  {a.verantwortlich_name ?? t("aufgaben.niemand")}
                  {a.frist ? ` · ${datumKurz(a.frist, i18n.language)}` : ""}
                  {a.ueberfaellig ? ` · ${t("aufgaben.ueberfaellig")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <select
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
                  aria-label={t("aufgaben.status")}
                  value={a.status}
                  disabled={!darfStatus}
                  onChange={(e) => aendern.mutate({ aid: a.id, daten: { status: e.target.value } })}
                >
                  {(["offen", "in_arbeit", "erledigt"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`aufgaben.status_${s}`)}
                    </option>
                  ))}
                </select>
                {reise.kann_verwalten && (
                  <button
                    type="button"
                    className={KNOPF_LEISE}
                    onClick={() => loeschen.mutate(a.id)}
                  >
                    {t("loeschen")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
