import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@askwell/shared"],
  async headers() {
    return [
      {
        source: "/((?!embed/?$).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
