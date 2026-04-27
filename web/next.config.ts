import type { NextConfig } from "next";
import path from "node:path";

const apiBackend = process.env.API_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  // Pin dev/build root to this package. Otherwise Next may pick a parent directory’s lockfile
  // (see dev warning) and stress manifest writes / watchers — a common source of _buildManifest ENOENT.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
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
