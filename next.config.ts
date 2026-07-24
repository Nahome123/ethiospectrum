import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  // The OCR renderer loads this native binding exclusively inside a protected
  // server route. Keep it external so Turbopack does not try to place its
  // platform binary in an ESM chunk.
  serverExternalPackages: ["@napi-rs/canvas"],
  turbopack: {
    root: process.cwd(),
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
