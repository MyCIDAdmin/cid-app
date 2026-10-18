import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";

/** Wie `useEscapeSchliessen`, aber als Bauteil für Fenster, die bedingt gezeichnet werden. */
export function EscapeSchliessen({ onClose }: { onClose: () => void }): null {
  useEscapeSchliessen(onClose);
  return null;
}
