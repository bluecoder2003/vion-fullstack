import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Disable canvas (required by some pdfjs builds)
      config.resolve.alias = { ...config.resolve.alias, canvas: false };
    }
    return config;
  },
};

export default nextConfig;
