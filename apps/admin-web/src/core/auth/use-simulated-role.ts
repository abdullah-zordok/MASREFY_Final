"use client";

import { useSyncExternalStore } from "react";
import { ADMIN_ROLES, type AdminRole } from "@/core/permissions/permissions";

const STORAGE_KEY = "admin-simulated-role";
const ROLE_CHANGE_EVENT = "admin-simulated-role-change";

export function subscribeToSimulatedRoleChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ROLE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ROLE_CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot(): AdminRole {
  const role = window.sessionStorage.getItem(STORAGE_KEY);
  return ADMIN_ROLES.includes(role as AdminRole) ? (role as AdminRole) : "super-admin";
}

export function useSimulatedRole(): AdminRole {
  return useSyncExternalStore(subscribeToSimulatedRoleChange, getSnapshot, () => "super-admin");
}

export function setSimulatedRole(role: AdminRole): void {
  const changed = getSnapshot() !== role;
  window.sessionStorage.setItem(STORAGE_KEY, role);
  if (!changed) return;
  window.dispatchEvent(new Event(ROLE_CHANGE_EVENT));
}
