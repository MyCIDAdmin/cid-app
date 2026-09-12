/**
 * Minuteur de session — mockup #vote-timer ("23:47", monospace, rouge sous 60s).
 * Calculé localement depuis `dateFin` (jamais depuis le compteur socket, qui ne se met à jour
 * qu'à chaque nouveau vote — voir participation_update — et ne conviendrait pas à un compte à
 * rebours continu).
 */
import { useEffect, useState } from "react";

interface MinuteurVoteProps {
  dateFin: string;
  onExpire?: () => void;
}

function formatDuree(secondes: number): string {
  const s = Math.max(0, secondes);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function MinuteurVote({ dateFin, onExpire }: MinuteurVoteProps) {
  const [secondesRestantes, setSecondesRestantes] = useState(() =>
    Math.floor((new Date(dateFin).getTime() - Date.now()) / 1000),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const reste = Math.floor((new Date(dateFin).getTime() - Date.now()) / 1000);
      setSecondesRestantes(reste);
      if (reste <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFin]);

  const urgent = secondesRestantes <= 60 && secondesRestantes > 0;

  return (
    <span
      className={`font-mono text-xl font-extrabold tracking-wide ${urgent ? "text-[#FF6B6B]" : ""}`}
    >
      {formatDuree(secondesRestantes)}
    </span>
  );
}
