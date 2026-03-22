export {};

declare global {
  interface Window {
    __CC_DEBUG_EVENTS__?: Array<{
      at: number;
      type: string;
      payload: Record<string, unknown>;
    }>;
  }
}
