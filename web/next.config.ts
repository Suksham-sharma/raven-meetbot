import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: { qualities: [75, 92] },
  turbopack: { root: import.meta.dirname },
  rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
