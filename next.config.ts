import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  // Revisited dashboard pages render from the client router cache for 30 s.
  // Server actions' revalidatePath still invalidates it after the user's own saves.
  experimental: { staleTimes: { dynamic: 30 } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
