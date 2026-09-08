"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext } from "react";
import {
  configureApiActorProvider,
  configureApiTokenProvider,
} from "@/core/api/client";
import { MockProvider } from "./MockProvider";
import { QueryProvider } from "./QueryProvider";

type AdminIdentity = {
  actorId: string;
  enabled: boolean;
  loaded: boolean;
};

const AdminIdentityContext = createContext<AdminIdentity>({
  actorId: "demo-admin",
  enabled: false,
  loaded: true,
});

export const useAdminIdentity = () => useContext(AdminIdentityContext);

function IdentityBridge({
  children,
  identity,
}: {
  children: React.ReactNode;
  identity: ReturnType<typeof useAuth>;
}) {
  const { getToken, isLoaded, userId } = identity;

  configureApiTokenProvider(() => getToken({ skipCache: true }));
  configureApiActorProvider(() => userId ?? null);

  return (
    <AdminIdentityContext.Provider value={{ actorId: userId ?? "", enabled: true, loaded: isLoaded }}>
      {children}
    </AdminIdentityContext.Provider>
  );
}

function IdentityQueryProvider({ children }: { children: React.ReactNode }) {
  const identity = useAuth();
  return (
    <QueryProvider key={identity.userId ?? (identity.isLoaded ? "signed-out" : "loading")}>
      <IdentityBridge identity={identity}>{children}</IdentityBridge>
    </QueryProvider>
  );
}

export function Providers({
  children,
  identityEnabled,
}: {
  children: React.ReactNode;
  identityEnabled: boolean;
}) {
  const content = <MockProvider>{children}</MockProvider>;
  return identityEnabled ? (
    <IdentityQueryProvider>{content}</IdentityQueryProvider>
  ) : (
    <QueryProvider>{content}</QueryProvider>
  );
}
