/**
 * Einlass : Tickets per Kamera scannen, Personen einlassen (auch nur ein Teil der Gruppe mit
 * demselben Code), Eintrag kurz danach zurücknehmen. Die Liste der Angemeldeten dient als
 * Rückfall ohne Scan. Zugriff : Büro/Verantwortliche und benannte Helfer (Rechte prüft der Server).
 */
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import HelferVerwaltung from "../../components/einlass/HelferVerwaltung";
import QrScanner from "../../components/einlass/QrScanner";
import Schrittfeld from "../../components/einlass/Schrittfeld";
import Zaehler from "../../components/einlass/Zaehler";
import {
  useEinlass,
  useEinlassBuchen,
  useEinlassPruefen,
  useEinlassRuecknahme,
} from "../../hooks/useEinlass";
import type { EinlassTyp, PruefErgebnis, TicketStand } from "../../types/einlass";
import { extractApiErrorMessage } from "../../utils/apiError";

interface Auswahl {
  stand: TicketStand;
  erwachsene: number;
  kinder: number;
}
interface Bestaetigung {
  name: string;
  erwachsene: number;
  kinder: number;
  einlass: string | null;
  offen: number;
}

const FEHLER_ERGEBNISSE = ["vollstaendig", "ungueltig", "unbekannt", "anderes_ereignis"] as const;
type FehlerErgebnis = (typeof FEHLER_ERGEBNISSE)[number];

export default function EinlassPage() {
  const { t } = useTranslation("tickets");
  const { typ, id } = useParams<{ typ: string; id: string }>();
  const gueltigerTyp: EinlassTyp = typ === "treffen" ? "treffen" : "veranstaltung";
  const zielId = id ?? "";
  const { data, isLoading, error } = useEinlass(gueltigerTyp, zielId);
  const pruefen = useEinlassPruefen(gueltigerTyp, zielId);
  const buchen = useEinlassBuchen(gueltigerTyp, zielId);
  const ruecknahme = useEinlassRuecknahme(gueltigerTyp, zielId);

  const [kamera, setKamera] = useState(false);
  const [manuell, setManuell] = useState("");
  const [suche, setSuche] = useState("");
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [meldung, setMeldung] = useState<{ art: FehlerErgebnis; name?: string } | null>(null);
  const [bestaetigung, setBestaetigung] = useState<Bestaetigung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const belegt = useRef(false);

  const weiter = () => {
    setAuswahl(null);
    setMeldung(null);
    setFehler(null);
    belegt.current = false;
  };

  const auswahlAus = (stand: TicketStand) =>
    setAuswahl({ stand, erwachsene: stand.offen_erwachsene, kinder: stand.offen_kinder });

  const verarbeiten = (text: string) => {
    if (belegt.current) return;
    belegt.current = true;
    setBestaetigung(null);
    setFehler(null);
    pruefen.mutate(text, {
      onSuccess: (r: PruefErgebnis) => {
        if ((r.ergebnis === "gueltig" || r.ergebnis === "teilweise") && r.ticket) {
          auswahlAus(r.ticket);
        } else if ((FEHLER_ERGEBNISSE as readonly string[]).includes(r.ergebnis)) {
          setMeldung({ art: r.ergebnis as FehlerErgebnis, name: r.ticket?.name });
        }
      },
      onError: (e) => {
        setFehler(extractApiErrorMessage(e, t("fehler")));
        belegt.current = false;
      },
    });
  };

  const manuellAbsenden = (e: FormEvent) => {
    e.preventDefault();
    if (manuell.trim()) {
      verarbeiten(manuell.trim());
      setManuell("");
    }
  };

  const einlassen = () => {
    if (!auswahl) return;
    const { stand, erwachsene, kinder } = auswahl;
    buchen.mutate(
      { ticket: stand.ticket, erwachsene, kinder },
      {
        onSuccess: (antwort) => {
          setBestaetigung({
            name: stand.name,
            erwachsene,
            kinder,
            einlass: antwort.einlass,
            offen: antwort.stand.offen_erwachsene + antwort.stand.offen_kinder,
          });
          setAuswahl(null);
          belegt.current = false;
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler"))),
      },
    );
  };

  const zuruecknehmen = () => {
    if (!bestaetigung?.einlass) return;
    ruecknahme.mutate(bestaetigung.einlass, {
      onSuccess: () => setBestaetigung(null),
      onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler"))),
    });
  };

  if (isLoading) return <p className="text-sm text-text-secondary">{t("laedt")}</p>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <p role="alert" className="text-sm text-status-dangerText">
          {extractApiErrorMessage(error, t("einlass_kein_zugriff"))}
        </p>
        <Link to="/tickets" className="text-sm underline">
          {t("einlass_zurueck")}
        </Link>
      </div>
    );
  }

  const filter = suche.trim().toLowerCase();
  const personen = data.personen.filter((p) => !filter || p.name.toLowerCase().includes(filter));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/tickets" className="text-xs text-text-tertiary underline">
          {t("einlass_zurueck")}
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">{data.titel}</h1>
        <p className="text-sm text-text-secondary">{t("einlass_titel")}</p>
      </div>

      {!data.ticket_aktiv && (
        <p className="rounded-cid bg-status-warningBg p-3 text-sm text-status-warningText">
          {t("einlass_nicht_aktiv")}
        </p>
      )}

      <Zaehler zaehler={data.zaehler} />

      {fehler && (
        <p
          role="alert"
          className="rounded-cid bg-status-dangerBg p-3 text-sm text-status-dangerText"
        >
          {fehler}
        </p>
      )}

      {bestaetigung && (
        <div role="status" className="rounded-cid bg-status-successBg p-3 text-status-successText">
          <p className="font-semibold">{t("einlass_eingelassen", { name: bestaetigung.name })}</p>
          <p className="text-sm">
            {t("einlass_summe", {
              erwachsene: bestaetigung.erwachsene,
              kinder: bestaetigung.kinder,
            })}
            {" · "}
            {bestaetigung.offen > 0
              ? t("einlass_noch_offen", { count: bestaetigung.offen })
              : t("einlass_alle_da")}
          </p>
          {bestaetigung.einlass && (
            <button
              type="button"
              onClick={zuruecknehmen}
              disabled={ruecknahme.isPending}
              className="mt-2 rounded-cid border border-current px-3 py-1 text-sm"
            >
              {t("einlass_rueckgaengig")}
            </button>
          )}
        </div>
      )}

      {meldung && (
        <div role="alert" className="rounded-cid bg-status-dangerBg p-3 text-status-dangerText">
          <p className="font-semibold">{t(`ergebnis_${meldung.art}`)}</p>
          <button
            type="button"
            onClick={weiter}
            className="mt-2 rounded-cid border border-current px-3 py-1 text-sm"
          >
            {t("einlass_weiter")}
          </button>
        </div>
      )}

      {auswahl && (
        <div
          className={`space-y-3 rounded-cid p-3 ${
            auswahl.stand.status === "teilweise"
              ? "bg-status-warningBg text-status-warningText"
              : "bg-status-successBg text-status-successText"
          }`}
        >
          <div>
            <p className="text-lg font-semibold">{auswahl.stand.name}</p>
            <p className="text-sm">
              {t("einlass_gebucht", {
                erwachsene: auswahl.stand.gebucht_erwachsene,
                kinder: auswahl.stand.gebucht_kinder,
              })}
              {" · "}
              {t("einlass_schon_drin", {
                erwachsene: auswahl.stand.drin_erwachsene,
                kinder: auswahl.stand.drin_kinder,
              })}
            </p>
          </div>
          <div className="space-y-2 text-text-primary">
            <Schrittfeld
              label={t("einlass_erwachsene")}
              wert={auswahl.erwachsene}
              max={auswahl.stand.offen_erwachsene}
              onChange={(n) => setAuswahl({ ...auswahl, erwachsene: n })}
            />
            <Schrittfeld
              label={t("einlass_kinder")}
              wert={auswahl.kinder}
              max={auswahl.stand.offen_kinder}
              onChange={(n) => setAuswahl({ ...auswahl, kinder: n })}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={einlassen}
              disabled={buchen.isPending || auswahl.erwachsene + auswahl.kinder === 0}
              className="flex-1 rounded-cid bg-ca px-4 py-3 text-base font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("einlass_einlassen")}
            </button>
            <button
              type="button"
              onClick={weiter}
              className="rounded-cid border border-current px-4 py-3 text-sm"
            >
              {t("einlass_abbrechen")}
            </button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        {kamera ? (
          <>
            <QrScanner onCode={verarbeiten} />
            <button
              type="button"
              onClick={() => setKamera(false)}
              className="text-sm text-text-secondary underline"
            >
              {t("scan_stoppen")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setKamera(true)}
            className="w-full rounded-cid bg-ca px-4 py-3 text-base font-medium text-white hover:bg-cad"
          >
            {t("scan_starten")}
          </button>
        )}
        <form onSubmit={manuellAbsenden} className="flex gap-2">
          <input
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            aria-label={t("scan_code_manuell")}
            placeholder={t("scan_code_manuell")}
            className="min-w-0 flex-1 rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-cid border border-text-tertiary/30 px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            {t("scan_pruefen")}
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">{t("liste_titel")}</h2>
        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          aria-label={t("liste_suche")}
          placeholder={t("liste_suche")}
          className="w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm"
        />
        <ul className="divide-y divide-text-tertiary/10 rounded-cid border border-text-tertiary/20">
          {personen.map((p) => (
            <li key={p.ticket} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-tertiary">
                  {t(`liste_status_${p.status}`)} ·{" "}
                  {t("einlass_gebucht", {
                    erwachsene: p.gebucht_erwachsene,
                    kinder: p.gebucht_kinder,
                  })}
                </p>
              </div>
              {p.status !== "vollstaendig" && (
                <button
                  type="button"
                  onClick={() => {
                    belegt.current = true;
                    setMeldung(null);
                    setBestaetigung(null);
                    auswahlAus(p);
                  }}
                  className="shrink-0 rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary"
                >
                  {t("einlass_einlassen")}
                </button>
              )}
            </li>
          ))}
          {personen.length === 0 && (
            <li className="p-3 text-sm text-text-tertiary">{t("liste_leer")}</li>
          )}
        </ul>
      </section>

      {data.darf_helfer_verwalten && <HelferVerwaltung typ={gueltigerTyp} id={zielId} />}
    </div>
  );
}
