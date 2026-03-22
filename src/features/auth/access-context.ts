import { createContext, useContext } from "react";

export type AccessGateContextValue = {
  accessMode: string;
  authenticated: boolean;
  loggingOut: boolean;
  logout: () => Promise<void>;
};

const AccessGateContext = createContext<AccessGateContextValue>({
  accessMode: "off",
  authenticated: true,
  loggingOut: false,
  logout: async () => {},
});

export function useAccessGate() {
  return useContext(AccessGateContext);
}

export { AccessGateContext };
