import type { NextConfig } from "next";

// Proxying the API under our own origin is what makes the httpOnly cookie
// usable: the server sends Allow-Origin: * with no Allow-Credentials and the
// cookie is sameSite lax, so a cross-origin SPA would have to hold a 7-day JWT
// in JS instead. Run the API on 3001 in dev — its own default is 3000.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Without this Next walks up and picks ~/pnpm-lock.yaml as the workspace
  // root, which also makes a bare `pnpm add` here install into ~/package.json.
  // import.meta.dirname, not __dirname — this config is ESM.
  turbopack: { root: import.meta.dirname },
  rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
