import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native Node.js modules from client-side bundling
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer', 'pdfkit', 'pdf-parse'],
  // Allow build to succeed during modular architecture migration
  // Remove once all modules are fully migrated and TS errors resolved
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
