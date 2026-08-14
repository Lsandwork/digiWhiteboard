import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Chromium/Playwright out of the Next bundler so Vercel can resolve native binaries.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "playwright"],
  outputFileTracingIncludes: {
    "/api/admin/fitdog-alerts": [
      "./node_modules/@sparticuz/chromium/**/*",
      "./node_modules/playwright-core/**/*"
    ],
    "/api/cron/fitdog-sync": [
      "./node_modules/@sparticuz/chromium/**/*",
      "./node_modules/playwright-core/**/*"
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**"
      },
      {
        protocol: "https",
        hostname: "**"
      }
    ],
    minimumCacheTTL: 14400
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      "dev"
  },
  async headers() {
    return [
      {
        source: "/assets/fitdog/social-moments/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/sw-social-moments.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }]
      },
      {
        source: "/admin/login",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }]
      },
      {
        source: "/gingr",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src 'self' https://fitdog.gingrapp.com https://*.gingrapp.com;"
          }
        ]
      }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  // Prefer env so org/project stay configurable per environment
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Source map upload auth token (build-time secret — never commit)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload wider set of client source files for better stack traces
  widenClientFileUpload: true,

  // Do not use tunnelRoute: "/monitoring" — under current Next/Turbopack
  // setups the tunnel often 404s and silently drops client envelopes.
  // Events go directly to Sentry ingest (DSN is public by design).

  // Suppress non-CI build noise
  silent: !process.env.CI
});
