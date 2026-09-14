import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon: it must stay a real CommonJS require at
  // runtime rather than being traced into the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // The floating badge Next injects in dev. It never ships in a build, and it
  // sits on top of the board.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Next compares Origin against Host to reject cross-site action posts.
      // Behind the tunnel the browser's origin is the public hostname while the
      // server sees a loopback request, so the public name has to be named here
      // or every mutation fails with "Invalid Server Actions request".
      allowedOrigins: ["privatecrm.operatingbureau.com"],
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
