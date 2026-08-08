import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', sourcemap: true },
  // @drivosafe/shared is a workspace symlink and react-road-hazards ships
  // untranspiled ESM; Vite handles both natively, but pre-bundling the library
  // keeps the dev-server module graph small.
  optimizeDeps: { include: ['react-road-hazards'] },
});
