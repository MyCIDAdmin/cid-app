/** Hooks React Query — Mitglieder-Reporting (nur lesend, ab Rolle RH). */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import * as api from "../api/membreReporting";
import type { MembreReportingFiltre } from "../types/membreReporting";

const keys = {
  all: ["membres", "reporting"] as const,
  mitglieder: (f: MembreReportingFiltre, page: number) =>
    [...keys.all, "mitglieder", f, page] as const,
  aktivitaeten: (f: MembreReportingFiltre, page: number) =>
    [...keys.all, "aktivitaeten", f, page] as const,
};

export function useMitgliederReporting(f: MembreReportingFiltre, page: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.mitglieder(f, page),
    queryFn: () => api.getMitgliederReporting(f, page),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAktivitaetenReporting(f: MembreReportingFiltre, page: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.aktivitaeten(f, page),
    queryFn: () => api.getAktivitaetenReporting(f, page),
    placeholderData: keepPreviousData,
    enabled,
  });
}
