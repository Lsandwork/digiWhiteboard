"use client";

import { createContext, useContext, type ReactNode } from "react";

type StudioFlags = {
  canManagePrinters: boolean;
  canManageSettings: boolean;
  canDeleteTemplates: boolean;
};

const Ctx = createContext<StudioFlags>({
  canManagePrinters: false,
  canManageSettings: false,
  canDeleteTemplates: false
});

export function CardStudioAccess({ children, ...flags }: StudioFlags & { children: ReactNode }) {
  return <Ctx.Provider value={flags}>{children}</Ctx.Provider>;
}

export function useCardStudioAccess() {
  return useContext(Ctx);
}
