/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
