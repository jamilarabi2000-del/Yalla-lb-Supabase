import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { main: path.resolve(__dirname, 'index.html') },
      output: {
        // React and the Supabase client change far less often than the app, so
        // they get their own files: a returning visitor keeps them cached
        // across deploys and downloads only the app code that changed.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase-vendor';
          return undefined;
        },
      },
    },
  },
}));
