/**
 * Client API — validation des inscriptions par RH/Admin (AHM-48,
 * backend/apps/accounts/views.py::PendingRegistrationsView & co).
 */
import { apiClient } from "./client";
import type { PendingRegistrationsPage, RegistrationsFiltres } from "../types/inscription";

export async function listPendingRegistrations(
  filtres: RegistrationsFiltres = {},
): Promise<PendingRegistrationsPage> {
  const params = Object.fromEntries(Object.entries(filtres).filter(([, v]) => Boolean(v)));
  const { data } = await apiClient.get<PendingRegistrationsPage>("/auth/pending-registrations/", {
    params,
  });
  return data;
}

/** Suit un lien next/previous CursorPagination (URL absolue). */
export async function getPendingRegistrationsPage(url: string): Promise<PendingRegistrationsPage> {
  const { data } = await apiClient.get<PendingRegistrationsPage>(url);
  return data;
}

export async function approveRegistration(id: string): Promise<void> {
  await apiClient.post(`/auth/pending-registrations/${id}/approve/`);
}

export async function refuseRegistration(id: string): Promise<void> {
  await apiClient.post(`/auth/pending-registrations/${id}/refuse/`);
}
