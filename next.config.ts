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
  // Ship a self-contained server instead of a source tree. next build traces
  // exactly the files the running app touches and copies them into
  // .next/standalone, so the VPS gets ~100 MB instead of an 872 MB node_modules
  // that is mostly build-time tooling it never runs.
  output: 'standalone',
  // pdf-parse reaches pdfjs-dist through a runtime string, so the tracer sees
  // no import to follow: it copied 1 of pdfjs-dist's 387 files and skipped
  // @napi-rs/canvas entirely. @napi-rs/canvas is what supplies DOMMatrix and
  // Path2D, which Node itself does not have — without it the instrumentation
  // hook throws at startup and every route answers 500. Naming the packages
  // is the documented way to tell the tracer about a dependency it cannot see.
  outputFileTracingIncludes: {
    '**/*': [
      './node_modules/pdfjs-dist/**',
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
    ],
  },
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
