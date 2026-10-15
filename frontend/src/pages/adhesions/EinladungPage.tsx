/** Einladung ins Familienpaket (R35) — öffentliche Seite, erreichbar über den Link in der Mail.
 * Mit Konto : Einladung nach eigener Zustimmung annehmen (nichts wird still verknüpft). Ohne
 * Konto : Registrierung mit vorausgefüllten Angaben. Ablehnen ist jederzeit ohne Anmeldung möglich. */
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import BrandLogo from "../../components/ui/BrandLogo";
import { useEinladung, useEinladungAblehnen, useEinladungAnnehmen } from "../../hooks/useAdhesions";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function EinladungPage() {
  const { t } = useTranslation("adhesions");
  const { token = "" } = useParams();
  const query = useEinladung(token);
  const annehmen = useEinladungAnnehmen(token);
  const ablehnen = useEinladungAblehnen(token);
  const user = useAuthStore((s) => s.user);
  const angemeldet = useAuthStore((s) => s.isAuthenticated);

  const einladung = annehmen.data ?? ablehnen.data ?? query.data;
  const offen = einladung?.status === "eingeladen" || einladung?.status === "zustimmung_offen";
  const richtigesKonto =
    angemeldet && einladung && user?.email?.toLowerCase() === einladung.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-md rounded-cid-lg bg-bg-primary p-6 shadow-lg">
        <div className="mb-4 flex justify-center">
          <BrandLogo />
        </div>
        <h1 className="mb-3 text-center text-lg font-bold text-text-primary">
          {t("einladung.titel")}
        </h1>

        {query.isLoading && <p className="text-sm text-text-tertiary">{t("offres.chargement")}</p>}
        {query.isError && (
          <p className="text-sm text-status-dangerText">{t("einladung.ungueltig")}</p>
        )}

        {einladung && (
          <>
            <p className="text-sm text-text-secondary">
              {t("einladung.text", {
                hauptperson: einladung.hauptperson,
                kampagne: einladung.kampagne,
                angebot: einladung.angebot ?? "—",
              })}
            </p>
            <p className="mt-2 text-xs text-text-tertiary">
              {einladung.vorname} {einladung.nachname} · {einladung.email}
            </p>

            {einladung.status === "offen" && (
              <p className="mt-4 text-sm text-text-secondary">{t("einladung.noch_nicht")}</p>
            )}
            {einladung.status === "angenommen" && (
              <p className="mt-4 text-sm text-status-successText">{t("einladung.angenommen")}</p>
            )}
            {einladung.status === "abgelehnt" && (
              <p className="mt-4 text-sm text-text-secondary">{t("einladung.abgelehnt")}</p>
            )}
            {einladung.status === "konflikt" && (
              <p className="mt-4 text-sm text-status-warningText">{t("einladung.konflikt")}</p>
            )}

            {offen && (
              <div className="mt-4 space-y-3">
                {richtigesKonto ? (
                  <button
                    type="button"
                    onClick={() => annehmen.mutate()}
                    disabled={annehmen.isPending}
                    className="w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                  >
                    {t("einladung.annehmen")}
                  </button>
                ) : angemeldet ? (
                  <p className="text-sm text-status-warningText">
                    {t("einladung.anderes_konto", { email: einladung.email })}
                  </p>
                ) : einladung.konto_vorhanden ? (
                  <Link
                    to="/login"
                    state={{ from: { pathname: `/einladung/${token}` } }}
                    className="block w-full rounded-cid bg-ca px-3 py-2 text-center text-sm font-medium text-white hover:bg-cad"
                  >
                    {t("einladung.anmelden")}
                  </Link>
                ) : (
                  <Link
                    to={`/register?einladung=${encodeURIComponent(token)}`}
                    className="block w-full rounded-cid bg-ca px-3 py-2 text-center text-sm font-medium text-white hover:bg-cad"
                  >
                    {t("einladung.konto_erstellen")}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => ablehnen.mutate()}
                  disabled={ablehnen.isPending}
                  className="w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                >
                  {t("einladung.ablehnen")}
                </button>
                <p className="text-[11px] text-text-tertiary">{t("einladung.datenschutz")}</p>
              </div>
            )}

            {(annehmen.isError || ablehnen.isError) && (
              <p className="mt-3 text-xs text-status-dangerText">
                {extractApiErrorMessage(annehmen.error ?? ablehnen.error, t("einladung.fehler"))}
              </p>
            )}
            {einladung.status === "angenommen" && angemeldet && (
              <Link
                to="/mon-adhesion"
                className="mt-4 block text-center text-sm text-ca hover:underline"
              >
                {t("einladung.zur_mitgliedschaft")}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
