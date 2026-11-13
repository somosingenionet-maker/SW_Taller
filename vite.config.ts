import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Las librerías grandes y que casi no cambian van en trozos propios: una publicación nueva
          // de la aplicación no obliga a volver a bajarlas (el navegador las tiene en caché).
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@sentry')) return 'vendor-sentry';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'vendor-graficas';
            if (id.includes('/motion') || id.includes('framer-motion')) return 'vendor-animacion';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
