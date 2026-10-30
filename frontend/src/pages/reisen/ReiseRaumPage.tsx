/** Der Reiseraum : Kopf mit Status, darunter die Reiter. „Auf einen Blick“ ist die erste Seite. */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";

import AufEinenBlick from "../../components/reisen/AufEinenBlick";
import AufgabenTab from "../../components/reisen/AufgabenTab";
import ChecklisteTab from "../../components/reisen/ChecklisteTab";
import EinstellungenTab from "../../components/reisen/EinstellungenTab";
import EntscheidungenTab from "../../components/reisen/EntscheidungenTab";
import InfosTab from "../../components/reisen/InfosTab";
import KostenTab from "../../components/reisen/KostenTab";
import MeineReiseTab from "../../components/reisen/MeineReiseTab";
import ReiseTeilen from "../../components/reisen/ReiseTeilen";
import TeilnehmendeTab from "../../components/reisen/TeilnehmendeTab";
import TabLeiste from "../../components/ui/TabLeiste";
import { useReise } from "../../hooks/useReisen";
import { restzeit, zeitraum } from "../../utils/reisen";

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section aria-label={titel} className="space-y-2">
      <h2 className="border-b border-text-tertiary/20 pb-1 text-base font-semibold text-text-primary">
        {titel}
      </h2>
      {children}
    </section>
  );
}

export default function ReiseRaumPage() {
  const { t, i18n } = useTranslation("reisen");
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const q = useReise(id);
  const [jetzt] = useState(() => Date.now());

  if (q.isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (q.isError || !q.data || !id) {
    return (
      <div data-testid="reise-nicht-gefunden" className="space-y-2">
        <p className="text-sm text-text-secondary">{t("nicht_gefunden")}</p>
        <Link to="/reisen" className="text-sm text-ca underline">
          {t("zurueck")}
        </Link>
      </div>
    );
  }
  const reise = q.data;
  const tage = reise.start ? restzeit(`${reise.start}T00:00:00`, jetzt) : null;

  // Fünf Reiter statt neun : alte Adressen (?tab=aufgaben …) führen weiter an die richtige Stelle.
  const tabs = [
    { id: "blick", label: t("tabs.blick") },
    { id: "planung", label: t("tabs.planung") },
    { id: "menschen", label: t("tabs.menschen") },
    ...(reise.meine ? [{ id: "meine", label: t("tabs.meine") }] : []),
    ...(reise.voll ? [{ id: "infos", label: t("tabs.infos_kosten") }] : []),
  ];
  const ALT: Record<string, string> = {
    entscheidungen: "planung",
    aufgaben: "planung",
    checkliste: "planung",
    teilnehmende: "menschen",
    kosten: "infos",
  };
  const gewuenscht = ALT[params.get("tab") ?? ""] ?? params.get("tab") ?? "blick";
  const einstellungen = gewuenscht === "einstellungen" && reise.kann_verwalten;
  const aktiv = einstellungen
    ? "einstellungen"
    : tabs.some((x) => x.id === gewuenscht)
      ? gewuenscht
      : "blick";
  const waehle = (tab: string) => setParams({ tab: ALT[tab] ?? tab }, { replace: true });

  return (
    <div className="space-y-3">
      <Link to="/reisen" className="text-xs text-ca underline">
        ← {t("titel")}
      </Link>
      <header>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-text-primary">{reise.titel}</h1>
          <ReiseTeilen reise={reise} />
        </div>
        <p className="text-sm text-text-secondary">
          {[reise.ziel_ort, reise.land, reise.stadion].filter(Boolean).join(", ")}
          {reise.start
            ? ` · ${zeitraum(reise.start, reise.ende, i18n.language)}`
            : ` · ${t("liste.datum_offen")}`}
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          {tage && !tage.abgelaufen && t("kopf.abreise_in", { tage: tage.tage })}
          {tage && !tage.abgelaufen && " · "}
          {t("liste.zaehler", { dabei: reise.dabei, interessiert: reise.interessiert })}
          {reise.min_teilnehmer
            ? ` · ${reise.findet_statt ? t("liste.findet_statt") : t("liste.ab_personen", { n: reise.min_teilnehmer })}`
            : ""}
          {reise.mein_status && ` · ${t(`status.${reise.mein_status}`)}`}
        </p>
      </header>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TabLeiste tabs={tabs} aktiv={aktiv} onChange={waehle} ariaLabel={reise.titel} />
        </div>
        {reise.kann_verwalten && (
          <button
            type="button"
            onClick={() => waehle(einstellungen ? "blick" : "einstellungen")}
            aria-pressed={einstellungen}
            aria-label={t("tabs.einstellungen")}
            title={t("tabs.einstellungen")}
            className={`rounded-cid px-3 py-2 text-sm ${einstellungen ? "bg-ca text-white" : "text-text-secondary hover:bg-bg-tertiary"}`}
          >
            ⚙
          </button>
        )}
      </div>
      {aktiv === "blick" && <AufEinenBlick reise={reise} onTab={waehle} />}
      {aktiv === "planung" && (
        <div className="space-y-6">
          <Abschnitt titel={t("tabs.entscheidungen")}>
            <EntscheidungenTab reise={reise} />
          </Abschnitt>
          {reise.voll && (
            <>
              <Abschnitt titel={t("tabs.aufgaben")}>
                <AufgabenTab reise={reise} />
              </Abschnitt>
              <Abschnitt titel={t("tabs.checkliste")}>
                <ChecklisteTab reise={reise} />
              </Abschnitt>
            </>
          )}
        </div>
      )}
      {aktiv === "menschen" && <TeilnehmendeTab reise={reise} />}
      {aktiv === "meine" && <MeineReiseTab reise={reise} />}
      {aktiv === "infos" && (
        <div className="space-y-6">
          <Abschnitt titel={t("tabs.infos")}>
            <InfosTab reise={reise} />
          </Abschnitt>
          <Abschnitt titel={t("tabs.kosten")}>
            <KostenTab reise={reise} />
          </Abschnitt>
        </div>
      )}
      {aktiv === "einstellungen" && <EinstellungenTab key={reise.id} reise={reise} />}
      {reise.chat_gruppe && reise.voll && (
        <Link
          to={`/groupes/${reise.chat_gruppe}`}
          className="inline-block text-sm text-ca underline"
        >
          {t("zum_chat")}
        </Link>
      )}
    </div>
  );
}
