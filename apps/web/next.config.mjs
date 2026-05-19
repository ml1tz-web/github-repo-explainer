/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles only the files needed to run the server,
  // producing a ~120 MB prod image instead of shipping all of node_modules.
  output: 'standalone',
  // Standalone needs to know the monorepo root so it traces deps from the
  // right workspace boundary.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // Transpile workspace packages so Next can resolve their TypeScript sources
  // without a pre-build step. This is the standard monorepo pattern.
  transpilePackages: ['@repo/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
