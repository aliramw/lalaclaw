export {};

declare module "*.css";

declare global {
  interface ImportMetaEnv {
    DEV?: boolean;
    MODE?: string;
    VITEST?: boolean;
  }

  interface ImportMeta {
    env?: ImportMetaEnv;
  }

  interface Window {
    __CC_DEBUG_EVENTS__?: Array<{
      at: number;
      type: string;
      payload: Record<string, unknown>;
    }>;
  }
}
