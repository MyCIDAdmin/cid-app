/**
 * Modul „Chats“ — ersetzt die getrennten Seiten „Nachrichten“ und „Chatgruppen“ (Konzept :
 * Konzept_Chats_Zusammenfuehrung). Desktop : Liste | Unterhaltung | Info ; Handy : Liste ODER
 * Unterhaltung, Info als Fenster. Routen : /chats und /chats/:kanal/:id (kanal = direkt|gruppe ;
 * Reisechats sind Gruppen). Nachrichten gehen nur über den WebSocket (hooks/useChatSocket.ts).
 */
import { useEffect, useState } from "react";
import { IconMessages } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import ChatListe from "../../components/chats/ChatListe";
import Dialog from "../../components/chats/Dialog";
import InfoPanel from "../../components/chats/InfoPanel";
import NeuerChatDialog from "../../components/chats/NeuerChatDialog";
import Unterhaltung from "../../components/chats/Unterhaltung";
import { chatKeys, useChatListe } from "../../hooks/useChats";
import type { ChatListItem } from "../../types/chats";
import type { ListenFilter } from "../../utils/chatsDesign";

/** true ab 1280 px : dort steht das Info-Panel als dritte Spalte, sonst als Fenster. */
function useBreit(): boolean {
  const abfrage = "(min-width: 1280px)";
  const [breit, setBreit] = useState(() => window.matchMedia?.(abfrage).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(abfrage);
    if (!m) return undefined;
    const aktualisiere = () => setBreit(m.matches);
    m.addEventListener?.("change", aktualisiere);
    return () => m.removeEventListener?.("change", aktualisiere);
  }, []);
  return breit;
}

export default function ChatsPage() {
  const { t } = useTranslation("communaute");
  const { kanal, id } = useParams<{ kanal?: string; id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const liste = useChatListe();
  const breit = useBreit();

  const [filter, setFilter] = useState<ListenFilter>("alle");
  const [suche, setSuche] = useState("");
  const [dialog, setDialog] = useState<"neu" | "entdecken" | null>(null);
  const [infoOffen, setInfoOffen] = useState(false);

  const gewaehlt: ChatListItem | undefined = liste.data?.find(
    (c) => c.id === id && (kanal === "direkt" ? c.art === "direkt" : c.art !== "direkt"),
  );

  function oeffne(k: "direkt" | "gruppe", chatId: string) {
    navigate(`/chats/${k}/${chatId}`);
  }

  async function oeffneNeu(k: "direkt" | "gruppe", chatId: string) {
    setDialog(null);
    await queryClient.invalidateQueries({ queryKey: chatKeys.liste });
    oeffne(k, chatId);
  }

  async function zurListe() {
    setInfoOffen(false);
    await queryClient.invalidateQueries({ queryKey: chatKeys.liste });
    navigate("/chats");
  }

  return (
    <div
      data-testid="chats-seite"
      className="flex h-[calc(100dvh-7rem)] min-h-[420px] overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm"
    >
      <aside
        aria-label={t("chats.titel")}
        className={`${id ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-text-tertiary/15 lg:w-80`}
      >
        <ChatListe
          chats={liste.data}
          laedt={liste.isLoading}
          fehler={liste.isError}
          gewaehlt={gewaehlt ? { art: gewaehlt.art, id: gewaehlt.id } : undefined}
          filter={filter}
          suche={suche}
          onFilter={setFilter}
          onSuche={setSuche}
          onWaehle={(c) => oeffne(c.art === "direkt" ? "direkt" : "gruppe", c.id)}
          onNeu={() => setDialog("neu")}
          onEntdecken={() => setDialog("entdecken")}
        />
      </aside>

      <main className={`${id ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {gewaehlt ? (
          <Unterhaltung
            key={gewaehlt.id}
            chat={gewaehlt}
            onZurueck={() => navigate("/chats")}
            onInfo={() => setInfoOffen((o) => !o)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-text-tertiary">
            <IconMessages size={40} aria-hidden="true" />
            <p className="text-sm">
              {id && !liste.isLoading ? t("chats.nicht_gefunden") : t("chats.waehle_einen_chat")}
            </p>
          </div>
        )}
      </main>

      {gewaehlt && infoOffen && breit && (
        <aside
          aria-label={t("chats.info")}
          className="w-80 shrink-0 border-l border-text-tertiary/15"
        >
          <InfoPanel chat={gewaehlt} onWeg={zurListe} />
        </aside>
      )}
      {gewaehlt && infoOffen && !breit && (
        <Dialog titel={t("chats.info")} onClose={() => setInfoOffen(false)}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InfoPanel chat={gewaehlt} onWeg={zurListe} />
          </div>
        </Dialog>
      )}

      {dialog && (
        <NeuerChatDialog start={dialog} onClose={() => setDialog(null)} onOeffne={oeffneNeu} />
      )}
    </div>
  );
}
