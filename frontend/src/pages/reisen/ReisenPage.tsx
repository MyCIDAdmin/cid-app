/**
 * Seite „Reisen & Fahrgemeinschaften“ : Reisen (Reiseräume) und die bisherigen Fahrgemeinschaften.
 * Die Fahrgemeinschaften bleiben unverändert (CovoituragePage) und unter /covoiturage erreichbar.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import SaisonTab from "../../components/reisen/SaisonTab";
import SteckbriefeAdmin from "../../components/reisen/SteckbriefeAdmin";
import TabLeiste from "../../components/ui/TabLeiste";
import { KARTE, KNOPF } from "../../components/reisen/ui";
import { useReisenListe, useSaison } from "../../hooks/useReisen";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { zeitraum } from "../../utils/reisen";
import CovoituragePage from "../evenements/CovoituragePage";
import type { ReiseListItem } from "../../types/reisen";

function ReiseKarte({ r }: { r: ReiseListItem }) {
  const { t, i18n } = useTranslation("reisen");
  return (
    <li>
      <Link
        to={`/reisen/${r.id}`}
        className={`${KARTE} block hover:shadow-md`}
        data-testid={`reise-${r.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-text-primary">{r.titel}</p>
            <p className="text-xs text-text-secondary">
              {[r.ziel_ort, r.land].filter(Boolean).join(", ")}
              {r.start
                ? ` · ${zeitraum(r.start, r.ende, i18n.language)}`
                : ` · ${t("liste.datum_offen")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {r.abgesagt && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
                {t("liste.abgesagt")}
              </span>
            )}
            {r.mein_status && (
              <span className="rounded-full bg-ca/10 px-2 py-0.5 text-ca">
                {t(`status.${r.mein_status}`)}
              </span>
            )}
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5">{t(`phase.${r.phase}`)}</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          {t("liste.zaehler", { dabei: r.dabei, interessiert: r.interessiert })}
          {r.min_teilnehmer
            ? ` · ${r.findet_statt ? t("liste.findet_statt") : t("liste.ab_personen", { n: r.min_teilnehmer })}`
            : ""}
        </p>
      </Link>
    </li>
  );
}

function ReisenListe() {
  const { t } = useTranslation("reisen");
  const [nurMeine, setNurMeine] = useState(false);
  const q = useReisenListe({ meine: nurMeine });
  const liste = q.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={nurMeine}
            onChange={(e) => setNurMeine(e.target.checked)}
          />
          {t("liste.nur_meine")}
        </label>
        <Link to="/reisen/neu" className={KNOPF}>
          {t("liste.neue_reise")}
        </Link>
      </div>
      {q.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {q.isError && (
        <p role="alert" className="text-sm text-red-600">
          {t("fehler.allgemein")}
        </p>
      )}
      {!q.isLoading && liste.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("liste.leer")}</p>
      )}
      <ul className="space-y-2">
        {liste.map((r) => (
          <ReiseKarte key={r.id} r={r} />
        ))}
      </ul>
    </div>
  );
}

/** Alle kommenden Spiele; zugeklappt, damit die Seite kurz bleibt. */
function SpieleAbschnitt() {
  const { t } = useTranslation("reisen");
  const [offen, setOffen] = useState(false);
  const anzahl = useSaison().data?.length;
  return (
    <section aria-label={t("tab_saison")}>
      <button
        type="button"
        aria-expanded={offen}
        aria-controls="reisen-spiele"
        onClick={() => setOffen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-cid-lg bg-bg-primary px-3 py-2 text-left shadow-sm hover:bg-bg-tertiary"
      >
        <span className="text-sm font-semibold">
          {t("saison.titel")}
          {anzahl !== undefined && (
            <span className="ml-2 text-xs font-normal text-text-secondary">
              {t("saison.anzahl", { n: anzahl })}
            </span>
          )}
        </span>
        <span className="text-xs text-text-secondary">
          {offen ? t("saison.verbergen") : t("saison.zeigen")}
          <span aria-hidden="true"> {offen ? "▴" : "▾"}</span>
        </span>
      </button>
      {offen && (
        <div id="reisen-spiele" className="mt-2">
          <SaisonTab />
        </div>
      )}
    </section>
  );
}

export default function ReisenPage() {
  const { t } = useTranslation("reisen");
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<"reisen" | "fahrgemeinschaften" | "steckbriefe">("reisen");
  const bureau = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);
  return (
    <div>
      <h1 className="mb-3 text-xl font-bold text-text-primary">{t("titel")}</h1>
      <TabLeiste
        ariaLabel={t("titel")}
        aktiv={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "reisen", label: t("tab_reisen") },
          { id: "fahrgemeinschaften", label: t("tab_fahrgemeinschaften") },
          ...(bureau ? [{ id: "steckbriefe", label: t("tab_steckbriefe") }] : []),
        ]}
      />
      {tab === "reisen" && (
        <div className="space-y-6">
          <section aria-label={t("tab_reisen")}>
            <h2 className="mb-2 text-sm font-semibold">{t("saison.alle_reisen")}</h2>
            <ReisenListe />
          </section>
          <SpieleAbschnitt />
        </div>
      )}
      {tab === "fahrgemeinschaften" && <CovoituragePage />}
      {tab === "steckbriefe" && bureau && <SteckbriefeAdmin />}
      <p className="mt-6 text-[11px] text-text-tertiary">{t("haftung")}</p>
    </div>
  );
}
