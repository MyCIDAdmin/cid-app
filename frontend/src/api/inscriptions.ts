/**
 * Client API — validation des inscriptions par RH/Admin (AHM-48,
 * backend/apps/accounts/views.py::PendingRegistrationsView & co).
 */
import { apiClient } from "./client";
import type { PendingRegistrationsPage } from "../types/inscription";

export async function listPendingRegistrations(): Promise<PendingRegistrationsPage> {
  const { data } = await apiClient.get<PendingRegistrationsPage>("/auth/pending-registrations/");
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
