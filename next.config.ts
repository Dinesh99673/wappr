import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // whatsapp-web.js and puppeteer ship native/binary assets and load files at
  // runtime — they must not be bundled by the Next server compiler.
  serverExternalPackages: [
    "whatsapp-web.js",
    "puppeteer",
    "puppeteer-core",
    "exceljs",
  ],
};

export default nextConfig;
