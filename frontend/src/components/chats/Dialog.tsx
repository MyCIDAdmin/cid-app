import { useId, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { hintergrundKlick, useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";

interface Props {
  titel: string;
  onClose: () => void;
  breit?: boolean;
}

/** Fenster : auf dem Handy von unten, am Desktop mittig. */
export default function Dialog({ titel, onClose, breit, children }: PropsWithChildren<Props>) {
  const { t } = useTranslation("communaute");
  const id = useId();
  useEscapeSchliessen(onClose);
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      {...hintergrundKlick(onClose)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-bg-primary shadow-xl sm:rounded-cid-lg ${
          breit ? "sm:max-w-xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-4">
          <h2 id={id} className="font-display text-xl text-text-primary">
            {titel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("chats.schliessen")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary"
          >
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
