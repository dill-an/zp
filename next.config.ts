import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several dev servers run from one checkout (each with its own NEXT_DIST_DIR).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
