import { BrowserContext } from "playwright";

export const NAME_SHIM =
  "globalThis.__name = globalThis.__name || function (target, value) { return target; }";

// Serialized by Playwright — must stay self-contained.
export function patchRTCPeerConnection(): void {
  window.__pcs = [];
  window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
    construct(target, args) {
      const pc = Reflect.construct(target, args);
      window.__pcs?.push(pc);
      return pc;
    },
  });
}

export async function installPcTap(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: NAME_SHIM });
  await context.addInitScript(patchRTCPeerConnection);
}
