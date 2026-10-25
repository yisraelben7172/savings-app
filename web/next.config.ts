import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Admin feed uploads (CSV up to 4 MB; Vercel caps request bodies at ~4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // /search?q=... is the same page as /deals?q=... (query string is kept).
  async redirects() {
    return [{ source: "/search", destination: "/deals", permanent: false }];
  },
  turbopack: {
    // web/ is its own app (the repo root holds the API's lockfile).
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
