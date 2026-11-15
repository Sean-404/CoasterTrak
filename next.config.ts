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
  async redirects() {
    return [
      // Merged into the guides and About (2026-11-15): they repeated the credit guides.
      {
        source: "/coaster-credits",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-tracker",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/coaster-trak",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/coaster-credit",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-credit-tracker",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-credit-app",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-credits-app",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-credit-logger",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/roller-coaster-credits",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/roller-coaster-credit-tracker",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-log",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-logger",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/coaster-tally",
        destination: "/guides/what-is-a-coaster-credit",
        permanent: true,
      },
      {
        source: "/roller-coaster-tracker",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/coaster-track",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/coastertrack",
        destination: "/",
        permanent: true,
      },
      {
        source: "/coastertrak",
        destination: "/",
        permanent: true,
      },
      {
        source: "/discover",
        destination: "/map",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // geolocation=(self): the map's "Find parks near me" asks for location; no third-party frame can.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
