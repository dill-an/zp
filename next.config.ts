import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several dev servers run from one checkout (each with its own NEXT_DIST_DIR and tsconfig copy).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG ?? "tsconfig.json" },
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Keeps dev servers lean when several run on one machine.
    webpackMemoryOptimizations: true,
    preloadEntriesOnStart: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Do not recompile when another dev server, the database or test output changes.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**", "**/.next-*/**", "**/data/**", "**/test-results/**", "**/playwright-report/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
