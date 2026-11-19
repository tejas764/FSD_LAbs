/** @type {import('next').NextConfig} */
const API_INTERNAL_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ?? "http://localhost:4000";

const MINIO_INTERNAL_BASE_URL =
  process.env.MINIO_INTERNAL_BASE_URL ?? "http://localhost:9000";

const nextConfig = {
  // Keep Turbopack inside this application when sibling projects have their own lockfiles.
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_INTERNAL_BASE_URL}/api/v1/:path*`,
      },
      {
        // Proxy MinIO object storage — resolves localhost:9000 in Codespaces
        source: "/minio/:path*",
        destination: `${MINIO_INTERNAL_BASE_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
