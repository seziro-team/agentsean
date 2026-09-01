import type { NextConfig } from "next";

/**
 * The control plane runs with zero credentials in CI and locally. Nothing here
 * may hard-require an environment variable at build time — every integration is
 * read lazily at request time and degrades to a "not configured" banner.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Security headers for the authenticated app. The daemon has its own,
  // stricter, same-origin policy (see ARCHITECTURE.md §3); this control plane
  // is a normal web app that must still deny framing and referrer leakage.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
