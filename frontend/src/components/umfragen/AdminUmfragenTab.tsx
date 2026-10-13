/**
 * Verwaltung der Umfragen (Release 11) als Tab in „Quiz-Verwaltung“: anlegen, bearbeiten,
 * veröffentlichen/zurückziehen, in den Neuigkeiten als „Wichtig“ ankündigen, Ergebnisse öffnen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useUmfrageAendern,
  useUmfrageAktion,
  useUmfrageBild,
  useUmfrageErstellen,
  useUmfrageLoeschen,
  useUmfragen,
} from "../../hooks/useUmfragen";
import type { Umfrage, UmfragePayload } from "../../types/umfragen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatiereFrist } from "../../utils/umfragen";
import UmfrageFormular from "./UmfrageFormular";

export default function AdminUmfragenTab({ modifiable }: { modifiable: boolean }) {
  const { t } = useTranslation("umfragen");
  const umfragen = useUmfragen();
  const erstellen = useUmfrageErstellen();
  const aendern = useUmfrageAendern();
  const aktion = useUmfrageAktion();
  const loeschen = useUmfrageLoeschen();
  const bildAendern = useUmfrageBild();
  const [bearbeite, setBearbeite] = useState<Umfrage | "neu" | null>(null);
  const [fehler, setFehler] = useState("");

  const zeigeFehler = (err: unknown) => setFehler(extractApiErrorMessage(err, t("admin.fehler")));

  async function speichern(payload: UmfragePayload, bild: File | null | undefined) {
    setFehler("");
    try {
      const gespeichert =
        bearbeite === "neu" || bearbeite === null
          ? await erstellen.mutateAsync(payload)
          : await aendern.mutateAsync({ id: bearbeite.id, payload });
      if (bild !== undefined) {
        await bildAendern.mutateAsync({ id: gespeichert.id, datei: bild });
      }
      setBearbeite(null);
    } catch (err) {
      zeigeFehler(err);
    }
  }

  function ausfuehren(id: string, a: "veroeffentlichen" | "zurueckziehen" | "ankuendigen") {
    setFehler("");
    aktion.mutate({ id, aktion: a }, { onError: zeigeFehler });
  }

  if (bearbeite !== null) {
    return (
      <UmfrageFormular
        umfrage={bearbeite === "neu" ? undefined : bearbeite}
        speichernLaeuft={erstellen.isPending || aendern.isPending || bildAendern.isPending}
        fehler={fehler}
        onSpeichern={speichern}
        onAbbrechen={() => {
          setBearbeite(null);
          setFehler("");
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!modifiable}
        onClick={() => setBearbeite("neu")}
        className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
      >
        {t("admin.neu")}
      </button>
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
      {(umfragen.data ?? []).length === 0 && (
        <p className="text-sm text-text-tertiary">{t("leer")}</p>
      )}
      <ul className="space-y-2">
        {(umfragen.data ?? []).map((u) => (
          <li key={u.id} className="space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link
                  to={`/umfragen/${u.id}`}
                  className="text-sm font-bold text-text-primary hover:underline"
                >
                  {u.titel}
                </Link>
                <p className="text-xs text-text-tertiary">
                  {t(u.veroeffentlicht ? "status.veroeffentlicht" : "status.entwurf")} ·{" "}
                  {t(u.abgelaufen ? "beendet_am" : "bis", { datum: formatiereFrist(u.frist) })} ·{" "}
                  {t(u.anonym ? "anonym" : "namentlich")} · {t(`zielgruppe.${u.zielgruppe}`)} ·{" "}
                  {t("ergebnisse.teilnehmende", { count: u.anzahl_teilnahmen ?? 0 })}
                </p>
              </div>
            </div>
            {modifiable && (
              <div className="flex flex-wrap gap-3 text-xs">
                <button type="button" onClick={() => setBearbeite(u)} className="text-ca underline">
                  {t("admin.bearbeiten")}
                </button>
                {u.veroeffentlicht ? (
                  <button
                    type="button"
                    onClick={() => ausfuehren(u.id, "zurueckziehen")}
                    className="text-text-secondary underline"
                  >
                    {t("admin.zurueckziehen")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => ausfuehren(u.id, "veroeffentlichen")}
                    className="font-medium text-ca underline"
                  >
                    {t("admin.veroeffentlichen")}
                  </button>
                )}
                {u.veroeffentlicht && !u.angekuendigt && (
                  <button
                    type="button"
                    onClick={() => ausfuehren(u.id, "ankuendigen")}
                    className="text-ca underline"
                  >
                    {t("admin.ankuendigen")}
                  </button>
                )}
                {u.angekuendigt && (
                  <span className="text-text-tertiary">✓ {t("admin.angekuendigt")}</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("admin.loeschen_bestaetigen", { titel: u.titel }))) {
                      setFehler("");
                      loeschen.mutate(u.id, { onError: zeigeFehler });
                    }
                  }}
                  className="text-status-dangerText underline"
                >
                  {t("admin.loeschen")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
