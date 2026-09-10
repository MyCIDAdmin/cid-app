/**
 * Hooks React Query — validation des inscriptions (AHM-48).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as inscriptionsApi from "../api/inscriptions";

const inscriptionsKeys = {
  all: ["inscriptions-en-attente"] as const,
  list: (pageUrl: string | null) => [...inscriptionsKeys.all, "list", pageUrl] as const,
};

export function usePendingRegistrations(pageUrl: string | null) {
  return useQuery({
    queryKey: inscriptionsKeys.list(pageUrl),
    queryFn: () =>
      pageUrl
        ? inscriptionsApi.getPendingRegistrationsPage(pageUrl)
        : inscriptionsApi.listPendingRegistrations(),
    placeholderData: keepPreviousData,
  });
}

export function useApproveRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inscriptionsApi.approveRegistration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inscriptionsKeys.all }),
  });
}

export function useRefuseRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inscriptionsApi.refuseRegistration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inscriptionsKeys.all }),
  });
}
