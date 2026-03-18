import { createContext, useContext } from "react";

const AccessGateContext = createContext({
  accessMode: "off",
  authenticated: true,
  loggingOut: false,
  logout: async () => {},
});

export function useAccessGate() {
  return useContext(AccessGateContext);
}

export { AccessGateContext };
