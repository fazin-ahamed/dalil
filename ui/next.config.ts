import type { NextConfig } from "next";

/* The desktop shell loads a static export (npm run build:shell). The site keeps the normal build. */
const forShell = process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
  ...(forShell ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } } : {}),
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
