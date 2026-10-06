import type { NextConfig } from "next";

// Static export: `npm run build` writes a plain HTML site to out/ (served as a Render static site).
// trailingSlash makes every route a folder with index.html, which any static host resolves.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
