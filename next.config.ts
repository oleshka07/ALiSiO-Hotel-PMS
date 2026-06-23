import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Exclude native Node.js modules from client-side bundling.
  // NOTE: pdfjs-dist is intentionally NOT listed here — it is an ESM module
  // that cannot be externalized by Turbopack (Next.js 16 default bundler).
  // Listing it causes "client reference manifest does not exist" build failures.
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer', 'pdfkit', 'pdf-parse'],
  // Allow build to succeed during modular architecture migration
  // Remove once all modules are fully migrated and TS errors resolved
  typescript: { ignoreBuildErrors: true },
  // Fix Turbopack workspace root detection on VPS
  turbopack: { root: '.' },
  async headers() {
    return [
      {
        source: "/w/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: "/((?!w/).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
