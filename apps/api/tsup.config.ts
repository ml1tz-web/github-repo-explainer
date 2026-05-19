import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  // Keep workspace packages and runtime deps external — they're installed in
  // node_modules by pnpm. Bundling them in would defeat caching and break
  // Prisma's runtime resolution of the generated client.
  external: [/^@repo\//, '@prisma/client'],
});
