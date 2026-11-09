import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // explicit "@/…" alias (mirrors tsconfig paths) so resolution never depends on tsconfig discovery
    config.resolve.alias["@"] = root;
    return config;
  },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};
export default nextConfig;
