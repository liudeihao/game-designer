import type { NextConfig } from "next";

const apiBackend = process.env.API_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    ],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiBackend.replace(/\/$/, "")}/api/:path*` }];
  },
};

export default nextConfig;
