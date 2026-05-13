import { BrowserContext } from "playwright";

// No-op shim for the __name() helper esbuild/tsx injects into serialized
// functions; inert under tsc-compiled output.
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

// Install before navigation so Meet's RTCPeerConnections get captured.
export async function installPcTap(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: NAME_SHIM });
  await context.addInitScript(patchRTCPeerConnection);
}
