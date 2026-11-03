/**
 * Eine Wahl : Überblick mit Phasen und Terminen, dazu je nach Rolle die Reiter Kandidatur,
 * Kandidat*innen, Prüfverfahren, Wahlausschuss und Bekanntmachungen.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";

import AusschussTab from "../../components/wahlen/AusschussTab";
import BekanntmachungenTab from "../../components/wahlen/BekanntmachungenTab";
import EinsprueceTab from "../../components/wahlen/EinsprueceTab";
import ErgebnisTab from "../../components/wahlen/ErgebnisTab";
import KandidatenTab from "../../components/wahlen/KandidatenTab";
import KandidaturTab from "../../components/wahlen/KandidaturTab";
import PhasenLeiste from "../../components/wahlen/PhasenLeiste";
import MitteilungenTab from "../../components/wahlen/MitteilungenTab";
import PruefverfahrenTab from "../../components/wahlen/PruefverfahrenTab";
import ReglementTab from "../../components/wahlen/ReglementTab";
import UnterstuetzenKarte from "../../components/wahlen/UnterstuetzenKarte";
import WahlbueroTab, { Wahlzettel } from "../../components/wahlen/WahlbueroTab";
import TabLeiste from "../../components/ui/TabLeiste";
import { useEinsprueche, useWahl } from "../../hooks/useWahlen";
import type { Wahl } from "../../types/wahlen";
import { datum } from "../../utils/wahlen";

const TERMIN_REIHE = [
  "ankuendigung_am",
  "kandidatur_von",
  "kandidatur_bis",
  "pruefung_bis",
  "kampagne_bis",
  "wahl_von",
  "wahl_bis",
  "einspruch_bis",
  "uebergabe_bis",
] as const;

function Ueberblick({ wahl, zumErgebnis }: { wahl: Wahl; zumErgebnis: () => void }) {
  const { t } = useTranslation("wahlen");
  return (
    <div className="space-y-4">
      {wahl.beschreibung && <p className="text-sm text-text-secondary">{wahl.beschreibung}</p>}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">{t("anlegen.form")}</dt>
          <dd>{t(`form.${wahl.form}`)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">{t("anlegen.mehrheit")}</dt>
          <dd>{t(`mehrheit.${wahl.mehrheit}`)}</dd>
        </div>
        {wahl.form === "liste" && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-secondary">{t("anlegen.listen_groesse")}</dt>
            <dd>{wahl.listen_groesse}</dd>
          </div>
        )}
        {TERMIN_REIHE.map((feld) => (
          <div key={feld} className="flex justify-between gap-2">
            <dt className="text-text-secondary">{t(`termine.${feld}`)}</dt>
            <dd>{datum(wahl.termine[feld], feld === "wahl_von" || feld === "wahl_bis")}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="text-sm font-semibold">
          {t("ausschuss.mitglieder", { n: wahl.ausschuss.length })}
        </h3>
        <p className="text-sm text-text-secondary">
          {wahl.ausschuss.map((a) => a.name).join(", ") || t("ausschuss.noch_keine")}
        </p>
      </section>
      {wahl.teilnahme?.wahlberechtigt && wahl.vote_session && (
        <p className="rounded-cid bg-bg-secondary p-3 text-sm" data-testid="meine-teilnahme">
          {wahl.teilnahme.hat_gewaehlt ? t("teilnahme.hat_gewaehlt") : t("teilnahme.noch_nicht")}
        </p>
      )}
      {wahl.teilnahme && !wahl.teilnahme.wahlberechtigt && wahl.vote_session && (
        <p className="text-xs text-text-tertiary">{t("teilnahme.nicht_berechtigt")}</p>
      )}
      {(wahl.vote_session !== null || wahl.phase >= 3) && <Wahlzettel wahl={wahl} />}
      {wahl.vote_session && wahl.vote_status === "ouverte" && !wahl.teilnahme?.hat_gewaehlt && (
        <Link
          to={`/votes?session=${wahl.vote_session}`}
          className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white"
        >
          {t("zur_stimmabgabe")}
        </Link>
      )}
      {wahl.vote_session && wahl.vote_status !== "ouverte" && (
        <button
          type="button"
          onClick={zumErgebnis}
          className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white"
        >
          {t("zum_ergebnis")}
        </button>
      )}
    </div>
  );
}

export default function WahlDetailPage() {
  const { t } = useTranslation("wahlen");
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const wahl = useWahl(id);
  const [tab, setTab] = useState("ueberblick");
  const stuetzeKandidatur = params.get("unterstuetzen");
  const einsprueche = useEinsprueche(id, (wahl.data?.phase ?? 0) >= 3);
  const hatEinsprueche = (einsprueche.data?.length ?? 0) > 0;

  const tabs = useMemo(() => {
    const w = wahl.data;
    if (!w) return [];
    const intern = w.ist_ausschuss || w.kann_verwalten;
    const liste = [{ id: "ueberblick", label: t("tab.ueberblick") }];
    if (w.meine_kandidatur || (w.status === "aktiv" && w.phase === 1 && !w.ist_ausschuss)) {
      liste.push({ id: "kandidatur", label: t("tab.kandidatur") });
    }
    if (w.phase >= 3) liste.push({ id: "kandidaten", label: t("tab.kandidaten") });
    if (w.status !== "entwurf" || intern)
      liste.push({ id: "reglement", label: t("tab.reglement") });
    if (w.vote_session && (w.phase >= 4 || intern)) {
      liste.push({ id: "ergebnis", label: t("tab.ergebnis") });
    }
    if (w.phase >= 3 && (intern || hatEinsprueche)) {
      liste.push({ id: "einsprueche", label: t("tab.einsprueche") });
    }
    if (intern) {
      liste.push({ id: "pruefung", label: t("tab.pruefung") });
      liste.push({ id: "bekanntmachungen", label: t("tab.bekanntmachungen") });
      liste.push({ id: "mitteilungen", label: t("tab.mitteilungen") });
      liste.push({ id: "buero", label: t("tab.buero") });
      liste.push({ id: "ausschuss", label: t("tab.ausschuss") });
    }
    return liste;
  }, [wahl.data, hatEinsprueche, t]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((x) => x.id === tab)) setTab("ueberblick");
  }, [tabs, tab]);

  if (wahl.isLoading) return <p className="p-4 text-sm text-text-tertiary">{t("laden")}</p>;
  if (wahl.isError || !wahl.data) {
    return (
      <p role="alert" className="p-4 text-sm text-status-dangerText">
        {t("fehler_laden")}
      </p>
    );
  }
  const w = wahl.data;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Link to="/wahlen" className="text-xs text-ca underline">
        ← {t("titel")}
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-text-primary">{w.titel}</h1>
          <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs">
            {t(`status.${w.status}`)}
          </span>
        </div>
        {w.vorgaenger && (
          <p className="text-sm text-text-secondary" data-testid="runde-hinweis">
            {t("folge.runde", { n: w.runde })}{" "}
            <Link to={`/wahlen/${w.vorgaenger.id}`} className="text-ca underline">
              {t("folge.zum_vorgaenger", { n: w.runde - 1 })}
            </Link>
          </p>
        )}
        <PhasenLeiste phase={w.phase} />
      </header>

      {stuetzeKandidatur && <UnterstuetzenKarte kandidaturId={stuetzeKandidatur} />}

      <TabLeiste tabs={tabs} aktiv={tab} onChange={setTab} ariaLabel={t("titel")} />
      {tab === "ueberblick" && <Ueberblick wahl={w} zumErgebnis={() => setTab("ergebnis")} />}
      {tab === "kandidatur" && <KandidaturTab wahl={w} />}
      {tab === "kandidaten" && <KandidatenTab wahl={w} />}
      {tab === "ergebnis" && <ErgebnisTab wahl={w} />}
      {tab === "einsprueche" && <EinsprueceTab wahl={w} />}
      {tab === "pruefung" && <PruefverfahrenTab wahl={w} />}
      {tab === "bekanntmachungen" && <BekanntmachungenTab wahl={w} />}
      {tab === "mitteilungen" && (
        <MitteilungenTab wahl={w} zuBekanntmachungen={() => setTab("bekanntmachungen")} />
      )}
      {tab === "reglement" && <ReglementTab wahl={w} />}
      {tab === "buero" && <WahlbueroTab wahl={w} />}
      {tab === "ausschuss" && <AusschussTab wahl={w} />}
    </div>
  );
}
