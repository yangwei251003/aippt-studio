const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8787";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return [{ source: "/backend-api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};
export default nextConfig;
