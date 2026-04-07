import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  // Allow large file uploads (250MB)
  api: {
    bodyParser: {
      sizeLimit: "250mb",
    },
  },
} as NextConfig;

export default nextConfig;
