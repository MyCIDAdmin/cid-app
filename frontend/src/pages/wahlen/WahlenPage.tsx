/**
 * Wahlen (Konzept_Abstimmungen_Wahlen.md, Vorschlag A „Geführter Wahlprozess“) : Übersicht aller
 * Wahlen mit laufender Phase. Büro und App-Admin legen neue Wahlen an ; alle anderen sehen nur
 * veröffentlichte Wahlen (der Server filtert).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import WahlAnlegenFormular from "../../components/wahlen/WahlAnlegenFormular";
import { useWahlen } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import { datum } from "../../utils/wahlen";

export default function WahlenPage() {
  const { t } = useTranslation("wahlen");
  const navigate = useNavigate();
  const wahlen = useWahlen();
  const [anlegen, setAnlegen] = useState(false);
  const rolle = useAuthStore((s) => s.user?.role);
  // Wie im Backend (services.ROLLEN_VERWALTUNG): nur Super Admin und Bureau Admin.
  const kannVerwalten = rolle === "super_admin" || rolle === "bureau_admin";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t("titel")}</h1>
          <p className="text-sm text-text-secondary">{t("intro")}</p>
        </div>
        <Link to="/votes" className="text-sm text-ca underline">
          {t("zu_abstimmungen")}
        </Link>
      </header>

      {kannVerwalten && !anlegen && (
        <button
          type="button"
          onClick={() => setAnlegen(true)}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white"
        >
          {t("neu")}
        </button>
      )}
      {anlegen && <WahlAnlegenFormular onFertig={(w) => navigate(`/wahlen/${w.id}`)} />}

      {wahlen.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {wahlen.isError && (
        <p role="alert" className="text-sm text-status-dangerText">
          {t("fehler_laden")}
        </p>
      )}
      {wahlen.data?.length === 0 && !anlegen && (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-secondary">{t("leer")}</p>
      )}
      <ul className="space-y-2">
        {wahlen.data?.map((wahl) => (
          <li key={wahl.id}>
            <Link
              to={`/wahlen/${wahl.id}`}
              className="block rounded-cid-lg bg-bg-primary p-4 shadow-sm hover:shadow"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-text-primary">{wahl.titel}</span>
                <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary">
                  {t(`status.${wahl.status}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {t(`form.${wahl.form}`)} · {t("aktuelle_phase")}: {t(`phase.${wahl.phase_name}`)} ·{" "}
                {datum(wahl.termine.wahl_von)} – {datum(wahl.termine.wahl_bis)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
