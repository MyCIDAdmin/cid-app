/**
 * Seite „Reisen & Fahrgemeinschaften“ : Reisen (Reiseräume) und die bisherigen Fahrgemeinschaften.
 * Die Fahrgemeinschaften bleiben unverändert (CovoituragePage) und unter /covoiturage erreichbar.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import InteresseKnopf from "../../components/reisen/InteresseKnopf";
import ReisenHero from "../../components/reisen/ReisenHero";
import SpieleStreifen from "../../components/reisen/SpieleStreifen";
import SteckbriefeAdmin from "../../components/reisen/SteckbriefeAdmin";
import TabLeiste from "../../components/ui/TabLeiste";
import { KNOPF } from "../../components/reisen/ui";
import ShareButton from "../../components/ui/ShareButton";
import { useBeitreten, useReisenListe } from "../../hooks/useReisen";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { zeitraum } from "../../utils/reisen";
import { coverFuer, fortschritt } from "../../utils/reisenDesign";
import CovoituragePage from "../evenements/CovoituragePage";
import type { ReiseListItem } from "../../types/reisen";

function ReiseKarte({ r }: { r: ReiseListItem }) {
  const { t, i18n } = useTranslation("reisen");
  const beitreten = useBeitreten(r.id);
  const anteil = fortschritt(r.dabei, r.min_teilnehmer);
  const fehlen = r.min_teilnehmer ? Math.max(r.min_teilnehmer - r.dabei, 0) : 0;
  const dabeiMoeglich =
    !r.mein_status && !r.abgesagt && r.beitritt !== "einladung" && r.mein_status !== "dabei";
  return (
    <li className="flex flex-col overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm">
      <Link to={`/reisen/${r.id}`} className="block hover:opacity-95" data-testid={`reise-${r.id}`}>
        <div
          className={`relative flex min-h-[7rem] flex-col justify-end bg-gradient-to-br ${coverFuer(r.ziel_ort || r.titel)} p-3 text-white`}
        >
          <div className="absolute left-3 top-3 flex flex-wrap gap-1 text-[11px]">
            <span className="rounded-full bg-white/25 px-2 py-0.5 font-semibold">
              {t(`phase.${r.phase}`)}
            </span>
            {r.abgesagt && (
              <span className="rounded-full bg-red-600 px-2 py-0.5">{t("liste.abgesagt")}</span>
            )}
          </div>
          {r.mein_status && (
            <span className="absolute right-3 top-3 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-cad">
              {t(`status.${r.mein_status}`)}
            </span>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90">
            {r.start ? zeitraum(r.start, r.ende, i18n.language) : t("liste.datum_offen")}
          </p>
          <p className="text-lg font-semibold leading-tight">{r.titel}</p>
          <p className="text-xs opacity-90">{[r.ziel_ort, r.land].filter(Boolean).join(", ")}</p>
        </div>
        <div className="space-y-1.5 px-3 pt-3">
          <div className="flex items-baseline justify-between gap-2 text-xs text-text-secondary">
            <span>{t("liste.zaehler", { dabei: r.dabei, interessiert: r.interessiert })}</span>
            {r.min_teilnehmer ? (
              <span className="font-medium">
                {r.findet_statt
                  ? t("liste.findet_statt")
                  : t("start.fortschritt_noch", { n: fehlen, min: r.min_teilnehmer })}
              </span>
            ) : null}
          </div>
          {anteil !== null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={anteil}
              aria-label={t("start.fortschritt_label")}
              className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary"
            >
              <div
                className={`h-full rounded-full ${r.findet_statt ? "bg-status-successText" : "bg-ca"}`}
                style={{ width: `${anteil}%` }}
              />
            </div>
          )}
        </div>
      </Link>
      <div className="mt-auto flex flex-wrap items-center gap-2 p-3">
        {dabeiMoeglich ? (
          <>
            <button
              type="button"
              className={`${KNOPF} min-h-[40px] flex-1`}
              disabled={beitreten.isPending}
              onClick={() => beitreten.mutate({ status: "dabei" })}
            >
              {r.beitritt === "genehmigung" ? t("beitritt.anfragen") : t("start.ich_dabei")}
            </button>
            <InteresseKnopf reise={r} />
          </>
        ) : (
          <InteresseKnopf reise={r} />
        )}
        {r.sichtbarkeit === "mitglieder" && !r.abgesagt && (
          <ShareButton path={`/reisen/${r.id}`} titre={r.titel} />
        )}
      </div>
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
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {liste.map((r) => (
          <ReiseKarte key={r.id} r={r} />
        ))}
      </ul>
    </div>
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
          <ReisenHero />
          <section aria-label={t("tab_reisen")}>
            <h2 className="mb-2 text-base font-semibold">{t("saison.alle_reisen")}</h2>
            <ReisenListe />
          </section>
          <SpieleStreifen />
        </div>
      )}
      {tab === "fahrgemeinschaften" && <CovoituragePage />}
      {tab === "steckbriefe" && bureau && <SteckbriefeAdmin />}
      <p className="mt-6 text-[11px] text-text-tertiary">{t("haftung")}</p>
    </div>
  );
}
