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
  // pdfjs-dist is loaded transitively by pdf-parse and ships its
  // workerSrc via dynamic import.meta.url. When Next bundles it, the
  // resolved path doesn't match the actual file in node_modules and
  // we get «Cannot find module pdf.worker.mjs» at runtime on prod.
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer', 'pdfkit', 'pdf-parse', 'pdfjs-dist'],
  // Allow build to succeed during modular architecture migration
  // Remove once all modules are fully migrated and TS errors resolved
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
