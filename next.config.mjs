/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**"
      }
    ]
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      "dev"
  }
};

export default nextConfig;
