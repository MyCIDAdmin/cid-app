/**
 * Kalender (Release 15) : Vereinskalender (alle Mitglieder), Büro-Kalender (Aufgabenträger und
 * Verwaltung) und „Meine Termine & Aufgaben“. Anlegen : Seite „Kalender“ mit Schreibrecht ;
 * Vorschlagen : Personen mit der Seite „Terminvorschläge einreichen“.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import AnsichtWaehler from "../../components/kalender/AnsichtWaehler";
import KalenderAnsicht from "../../components/kalender/KalenderAnsicht";
import KalenderLegende from "../../components/kalender/KalenderLegende";
import OffeneDienste from "../../components/kalender/OffeneDienste";
import TerminfindungFormular from "../../components/kalender/TerminfindungFormular";
import TerminfindungListe from "../../components/kalender/TerminfindungListe";
import TerminDialog from "../../components/kalender/TerminDialog";
import TerminFormular from "../../components/kalender/TerminFormular";
import WochenmailSchalter from "../../components/kalender/WochenmailSchalter";
import { speicherePraeferenzen } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";
import { useKalenderEintraege, useKalenderZugang } from "../../hooks/useKalender";
import {
  KATEGORIEN,
  type Ansicht,
  type KalenderEintrag,
  type Kategorie,
  type Termin,
} from "../../types/kalender";
import { monatsRaster } from "../../utils/kalender";

type Modus = "monat" | "liste";

export default function KalenderPage() {
  const { t, i18n } = useTranslation("kalender");
  const zugang = useKalenderZugang();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [gewaehlt, setGewaehlt] = useState<Ansicht[]>(
    () => user?.ui_praeferenzen?.kalender_ansichten ?? ["verein"],
  );
  const [monat, setMonat] = useState(() => {
    const heute = new Date();
    return new Date(heute.getFullYear(), heute.getMonth(), 1);
  });
  const [modus, setModus] = useState<Modus>("monat");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [offen, setOffen] = useState<KalenderEintrag | null>(null);
  const [findung, setFindung] = useState(false);
  const [formular, setFormular] = useState<{ termin?: Termin; vorschlag: boolean } | null>(null);

  const { von, bis } = useMemo(() => monatsRaster(monat), [monat]);
  const z = zugang.data;
  const verfuegbar = useMemo<Ansicht[]>(
    () => ["verein", ...(z?.buero ? (["buero"] as const) : []), "meine"],
    [z?.buero],
  );
  const ansichten = useMemo<Ansicht[]>(() => {
    const erlaubt = gewaehlt.filter((a) => verfuegbar.includes(a));
    return erlaubt.length > 0 ? erlaubt : ["verein"];
  }, [gewaehlt, verfuegbar]);
  const eintraege = useKalenderEintraege(ansichten, von, bis);
  const gefiltert = (eintraege.data ?? []).filter((e) => !kategorie || e.kategorie === kategorie);

  function waehleSichten(neu: Ansicht[]) {
    setGewaehlt(neu);
    if (user) {
      // Auswahl merken (Einstellung des Kontos) ; schlägt das fehl, gilt sie nur für diese Sitzung.
      speicherePraeferenzen({ ui_praeferenzen: { kalender_ansichten: neu } })
        .then(setUser)
        .catch(() => undefined);
    }
  }

  function verschiebe(delta: number) {
    setMonat((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-text-primary">{t("titel")}</h1>
        {z?.schreiben && (
          <button
            type="button"
            onClick={() => setFindung(true)}
            className="ms-auto rounded-cid border border-ca px-3 py-1.5 text-sm font-semibold text-ca"
          >
            {t("findung.button")}
          </button>
        )}
        {(z?.schreiben || z?.vorschlagen) && (
          <button
            type="button"
            onClick={() => setFormular({ vorschlag: !z?.schreiben })}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white"
          >
            {z?.schreiben ? t("neuer_termin") : t("termin_vorschlagen")}
          </button>
        )}
      </div>

      <TerminfindungListe />
      <OffeneDienste />
      <WochenmailSchalter />

      <AnsichtWaehler verfuegbar={verfuegbar} aktiv={ansichten} onChange={waehleSichten} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t("vorheriger_monat")}
          onClick={() => verschiebe(-1)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
        >
          ‹
        </button>
        <span className="min-w-[9rem] text-center text-sm font-semibold text-text-primary">
          {monat.toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label={t("naechster_monat")}
          onClick={() => verschiebe(1)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => {
            const h = new Date();
            setMonat(new Date(h.getFullYear(), h.getMonth(), 1));
          }}
          className="rounded-cid px-2 py-1 text-xs text-ca underline"
        >
          {t("heute")}
        </button>
        <select
          aria-label={t("filter.kategorie")}
          value={kategorie}
          onChange={(e) => setKategorie(e.target.value as Kategorie | "")}
          className="ms-auto rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-xs"
        >
          <option value="">{t("filter.alle")}</option>
          {KATEGORIEN.map((k) => (
            <option key={k} value={k}>
              {t(`kategorie.${k}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("modus.label")}
          value={modus}
          onChange={(e) => setModus(e.target.value as Modus)}
          className="rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-xs"
        >
          <option value="monat">{t("modus.monat")}</option>
          <option value="liste">{t("modus.liste")}</option>
        </select>
      </div>

      {eintraege.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {eintraege.isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {!eintraege.isLoading && !eintraege.isError && (
        <KalenderAnsicht eintraege={gefiltert} monat={monat} modus={modus} onWaehle={setOffen} />
      )}

      <KalenderLegende />

      {findung && <TerminfindungFormular onFertig={() => setFindung(false)} />}

      {offen && (
        <TerminDialog
          eintrag={offen}
          zugang={z}
          onSchliessen={() => setOffen(null)}
          onBearbeiten={(termin) => {
            setOffen(null);
            setFormular({ termin, vorschlag: false });
          }}
        />
      )}
      {formular && (
        <TerminFormular
          termin={formular.termin}
          vorschlag={formular.vorschlag}
          onFertig={() => setFormular(null)}
          onAbbrechen={() => setFormular(null)}
        />
      )}
    </div>
  );
}
