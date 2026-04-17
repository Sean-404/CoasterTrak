import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const adsenseScriptSources = [
  "https://pagead2.googlesyndication.com",
  "https://partner.googleadservices.com",
].join(" ");
const adsenseConnectSources = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://partner.googleadservices.com",
].join(" ");
const adsenseFrameSources = [
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://pagead2.googlesyndication.com",
].join(" ");

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Next.js injects small inline bootstrap/data scripts unless CSP nonces are wired up.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${adsenseScriptSources}`,
  isDev
    ? `connect-src 'self' http: https: ws: wss: ${adsenseConnectSources}`
    : `connect-src 'self' https: wss: ${adsenseConnectSources}`,
  `frame-src 'self' ${adsenseFrameSources}`,
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
