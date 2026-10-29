/** Der Reiseraum : Kopf mit Status, darunter die Reiter. „Auf einen Blick“ ist die erste Seite. */
import { useState } from "react";
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
import TeilnehmendeTab from "../../components/reisen/TeilnehmendeTab";
import TabLeiste from "../../components/ui/TabLeiste";
import { useReise } from "../../hooks/useReisen";
import { restzeit, zeitraum } from "../../utils/reisen";

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

  const tabs = [
    { id: "blick", label: t("tabs.blick") },
    { id: "entscheidungen", label: t("tabs.entscheidungen") },
    { id: "teilnehmende", label: t("tabs.teilnehmende") },
    ...(reise.meine ? [{ id: "meine", label: t("tabs.meine") }] : []),
    ...(reise.voll
      ? [
          { id: "aufgaben", label: t("tabs.aufgaben") },
          { id: "checkliste", label: t("tabs.checkliste") },
          { id: "infos", label: t("tabs.infos") },
          { id: "kosten", label: t("tabs.kosten") },
        ]
      : []),
    ...(reise.kann_verwalten ? [{ id: "einstellungen", label: t("tabs.einstellungen") }] : []),
  ];
  const gewuenscht = params.get("tab") ?? "blick";
  const aktiv = tabs.some((x) => x.id === gewuenscht) ? gewuenscht : "blick";
  const waehle = (tab: string) => setParams({ tab }, { replace: true });

  return (
    <div className="space-y-3">
      <Link to="/reisen" className="text-xs text-ca underline">
        ← {t("titel")}
      </Link>
      <header>
        <h1 className="text-xl font-bold text-text-primary">{reise.titel}</h1>
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
      <TabLeiste tabs={tabs} aktiv={aktiv} onChange={waehle} ariaLabel={reise.titel} />
      {aktiv === "blick" && <AufEinenBlick reise={reise} onTab={waehle} />}
      {aktiv === "entscheidungen" && <EntscheidungenTab reise={reise} />}
      {aktiv === "teilnehmende" && <TeilnehmendeTab reise={reise} />}
      {aktiv === "meine" && <MeineReiseTab reise={reise} />}
      {aktiv === "aufgaben" && <AufgabenTab reise={reise} />}
      {aktiv === "checkliste" && <ChecklisteTab reise={reise} />}
      {aktiv === "infos" && <InfosTab reise={reise} />}
      {aktiv === "kosten" && <KostenTab reise={reise} />}
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
