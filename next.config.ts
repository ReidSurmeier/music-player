import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/music-player",
  images: { unoptimized: true },
};

export default nextConfig;
