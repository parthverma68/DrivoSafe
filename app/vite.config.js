import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
  // react-road-hazards ships untranspiled ESM from node_modules; Vite handles
  // it natively, but pre-bundling keeps the dev-server graph small.
  optimizeDeps: { include: ['react-road-hazards'] },
});
