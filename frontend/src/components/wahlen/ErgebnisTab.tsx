/**
 * Ergebnis : bis zur Freigabe durch den Ausschuss bleibt es verschlossen (der Server liefert dann
 * nur die Beteiligung an den Ausschuss). Danach Zahlen, Ausgang, Protokoll und Einspruch.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { protokollPdf } from "../../api/wahlen";
import { useErgebnis, useProtokoll, useProtokollUnterschreiben } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { ErgebnisInhalt, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";
import EinspruchFormular from "./EinspruchFormular";
import FreigabeBlock from "./FreigabeBlock";

function Zahlen({ e }: { e: ErgebnisInhalt }) {
  const { t } = useTranslation("wahlen");
  return (
    <div className="space-y-3">
      <p className="text-sm" data-testid="beteiligung">
        {t("ergebnis.beteiligung", {
          a: e.beteiligung.abgegeben,
          b: e.beteiligung.berechtigt,
          p: e.beteiligung.prozent,
        })}
        {e.schwelle ? ` ${t("ergebnis.schwelle", { p: e.schwelle })}` : ""}
      </p>
      <ul className="space-y-2">
        {e.optionen.map((o) => (
          <li key={o.id} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className={e.gewaehlt.includes(o.label) ? "font-semibold" : ""}>
                {o.label}
                {e.gewaehlt.includes(o.label) && ` · ${t("ergebnis.gewaehlt_marke")}`}
              </span>
              <span className="tabular-nums">
                {o.stimmen} · {o.prozent} %
              </span>
            </div>
            <div className="h-2 rounded-full bg-bg-secondary" aria-hidden="true">
              <div
                className="h-2 rounded-full bg-ca"
                style={{ width: `${Math.min(100, o.prozent)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="rounded-cid bg-bg-secondary p-3 text-sm font-medium" data-testid="ausgang">
        {t(`ergebnis.ausgang_${e.ausgang}`, {
          gewaehlt: e.gewaehlt.join(", "),
          zwischen: e.stichwahl_zwischen.join(", "),
        })}
      </p>
    </div>
  );
}

function ProtokollBlock({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const protokoll = useProtokoll(wahl.id);
  const unterschreiben = useProtokollUnterschreiben(wahl.id);
  const userId = String(useAuthStore((s) => s.user?.id ?? ""));
  const [fehler, setFehler] = useState("");
  const p = protokoll.data;
  if (!p) return null;
  const habeUnterschrieben = p.unterschriften.some((u) => String(u.user) === userId);

  async function pdf() {
    try {
      const blob = await protokollPdf(wahl.id);
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch (e) {
      setFehler(extractApiErrorMessage(e, t("protokoll.fehler")));
    }
  }

  return (
    <section
      className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="protokoll"
    >
      <h3 className="text-sm font-semibold">{t("protokoll.titel")}</h3>
      <p className="text-xs text-text-secondary">
        {t("protokoll.stand", { datum: datum(p.erzeugt_am, true) })}
      </p>
      <p className="text-sm">
        {p.unterschriften_fehlen > 0
          ? t("protokoll.fehlen", { n: p.unterschriften_fehlen })
          : t("protokoll.vollstaendig")}
      </p>
      {p.unterschriften.length > 0 && (
        <ul className="text-xs text-text-secondary">
          {p.unterschriften.map((u) => (
            <li key={String(u.user)}>
              {u.name} · {datum(u.am, true)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={pdf} className="text-sm text-ca underline">
          {t("protokoll.pdf")}
        </button>
        {wahl.ist_ausschuss && !habeUnterschrieben && (
          <button
            type="button"
            onClick={() =>
              unterschreiben.mutate(undefined, {
                onError: (e) => setFehler(extractApiErrorMessage(e, t("protokoll.fehler"))),
              })
            }
            disabled={unterschreiben.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t("protokoll.unterschreiben")}
          </button>
        )}
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </section>
  );
}

export default function ErgebnisTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const ergebnis = useErgebnis(wahl.id, wahl.vote_session !== null);
  const [einspruch, setEinspruch] = useState(false);
  const daten = ergebnis.data;
  const intern = wahl.ist_ausschuss || wahl.kann_verwalten;

  if (!wahl.vote_session) {
    return <p className="text-sm text-text-secondary">{t("ergebnis.noch_nicht")}</p>;
  }
  if (!daten) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;

  if (!daten.freigegeben) {
    return (
      <div className="space-y-3" data-testid="ergebnis-zu">
        <p className="text-sm text-text-secondary">
          {daten.beendet ? t("ergebnis.verschlossen") : t("ergebnis.laeuft")}
        </p>
        {intern && daten.beteiligung && (
          <p className="text-sm">
            {t("ergebnis.beteiligung", {
              a: daten.beteiligung.abgegeben,
              b: daten.beteiligung.berechtigt,
              p: daten.beteiligung.prozent,
            })}
          </p>
        )}
        {intern && daten.beendet && <FreigabeBlock wahl={wahl} art="ergebnis" />}
      </div>
    );
  }

  const kannEinspruch =
    !intern &&
    wahl.einspruch_ergebnis_bis !== null &&
    new Date(wahl.einspruch_ergebnis_bis).getTime() > Date.now();

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <Zahlen e={daten} />
        <p className="text-xs text-text-tertiary">
          {t("ergebnis.veroeffentlicht", { datum: datum(daten.freigegeben_am, true) })}
        </p>
      </section>
      <ProtokollBlock wahl={wahl} />
      {kannEinspruch && (
        <section className="space-y-2">
          {einspruch ? (
            <EinspruchFormular wahl={wahl.id} art="ergebnis" bis={wahl.einspruch_ergebnis_bis} />
          ) : (
            <button
              type="button"
              onClick={() => setEinspruch(true)}
              className="text-sm text-ca underline"
            >
              {t("einspruch.einlegen_ergebnis")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
