import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Sin esto Turbopack infiere mal la raíz en un monorepo y avisa en cada build.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
