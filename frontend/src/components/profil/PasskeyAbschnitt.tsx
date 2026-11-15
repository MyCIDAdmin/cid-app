/**
 * Abschnitt "Anmeldung per Fingerabdruck oder Gesicht" unter Mein Profil > Einstellungen.
 * Jedes Mitglied richtet Passkeys freiwillig selbst ein (mehrere Geräte möglich) und kann sie
 * wieder entfernen. Ein Passkey ersetzt Passwort und E-Mail-Code bei der Anmeldung.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchPasskeys, passkeyEinrichten, passkeyEntfernen } from "../../api/auth";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import { istAbbruch, passkeysUnterstuetzt } from "../../utils/webauthn";

const KARTE = "rounded-cid-lg bg-bg-primary p-4 shadow-sm";
const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm";
const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50";
const KNOPF_SEKUNDAER =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";

function vorschlagName(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  return "Passkey";
}

export default function PasskeyAbschnitt() {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const unterstuetzt = passkeysUnterstuetzt();
  const liste = useQuery({ queryKey: ["passkeys"], queryFn: fetchPasskeys });
  const [name, setName] = useState(vorschlagName);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState(false);

  const einrichten = useMutation({
    mutationFn: () => passkeyEinrichten(name.trim() || vorschlagName()),
    onSuccess: () => {
      setErfolg(true);
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => {
      if (istAbbruch(err)) return;
      setFehler(extractApiErrorMessage(err, t("einstellungen.passkey.fehler")));
    },
  });
  const entfernen = useMutation({
    mutationFn: (id: string) => passkeyEntfernen(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["passkeys"] }),
    onError: (err) => setFehler(extractApiErrorMessage(err, t("einstellungen.passkey.fehler"))),
  });

  const datum = (iso: string) => new Date(iso).toLocaleDateString(lokaleSprache());
  const passkeys = liste.data ?? [];

  return (
    <section className={KARTE}>
      <h2 className="text-sm font-bold text-text-primary">{t("einstellungen.passkey.titel")}</h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("einstellungen.passkey.hinweis")}</p>

      {!unterstuetzt && (
        <p className="text-sm text-text-tertiary">
          {t("einstellungen.passkey.nicht_unterstuetzt")}
        </p>
      )}

      {passkeys.length === 0 && !liste.isLoading && (
        <p className="mb-3 text-sm text-text-tertiary">{t("einstellungen.passkey.leer")}</p>
      )}
      {passkeys.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-cid border border-text-tertiary/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-tertiary">
                  {t("einstellungen.passkey.eingerichtet", { datum: datum(p.created_at) })}
                  {p.last_used_at
                    ? ` · ${t("einstellungen.passkey.zuletzt", { datum: datum(p.last_used_at) })}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={entfernen.isPending}
                onClick={() => entfernen.mutate(p.id)}
                className={KNOPF_SEKUNDAER}
                aria-label={t("einstellungen.passkey.entfernen_label", { name: p.name })}
              >
                {t("einstellungen.passkey.entfernen")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unterstuetzt && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-secondary">
            {t("einstellungen.passkey.name")}
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className={`${FELD} mt-1 max-w-[14rem]`}
            />
          </label>
          <button
            type="button"
            disabled={einrichten.isPending}
            onClick={() => {
              setFehler("");
              setErfolg(false);
              einrichten.mutate();
            }}
            className={KNOPF}
          >
            {t("einstellungen.passkey.einrichten")}
          </button>
        </div>
      )}
      {erfolg && (
        <p className="mt-2 text-xs text-status-successText">{t("einstellungen.passkey.erfolg")}</p>
      )}
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
    </section>
  );
}
