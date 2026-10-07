/** Logo des Partners: Vorschau, Hochladen/Ersetzen und Entfernen. */
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useEntferneLogo, useLadeLogoHoch } from "../../hooks/usePartner";
import { extractApiErrorMessage } from "../../utils/apiError";

interface Props {
  partnerId: string;
  nom: string;
  logoUrl: string | null;
  schreibbar: boolean;
}

export default function PartnerLogoPanel({ partnerId, nom, logoUrl, schreibbar }: Props) {
  const { t } = useTranslation("partner");
  const eingabe = useRef<HTMLInputElement>(null);
  const hochladen = useLadeLogoHoch(partnerId);
  const entfernen = useEntferneLogo(partnerId);
  const fehler = hochladen.error ?? entfernen.error;

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("logo")}</h2>
      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={t("logo_alt", { name: nom })}
            className="h-16 max-w-[10rem] rounded-cid border border-text-tertiary/20 bg-white object-contain p-1"
          />
        ) : (
          <span className="text-sm text-text-tertiary">{t("kein_logo")}</span>
        )}
        {schreibbar && (
          <div className="flex gap-2">
            <input
              ref={eingabe}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("logo_datei")}
              className="hidden"
              onChange={(e) => {
                const datei = e.target.files?.[0];
                if (datei) hochladen.mutate(datei);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={hochladen.isPending}
              onClick={() => eingabe.current?.click()}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {logoUrl ? t("logo_ersetzen") : t("logo_hochladen")}
            </button>
            {logoUrl && (
              <button
                type="button"
                disabled={entfernen.isPending}
                onClick={() => entfernen.mutate()}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-status-dangerText hover:bg-bg-tertiary"
              >
                {t("logo_entfernen")}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-text-tertiary">{t("logo_hinweis")}</p>
      {fehler != null && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(fehler, t("fehler_aktion"))}
        </p>
      )}
    </section>
  );
}
