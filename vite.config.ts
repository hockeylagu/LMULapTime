import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Groups rather than manualChunks: manualChunks let react and react-dom's entry files land in the lucide and
        // recharts chunks, which made every page preload recharts.
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 30 },
            { name: 'recharts', test: /node_modules[\/]recharts[\/]/, priority: 20 },
            { name: 'lucide', test: /node_modules[\/]lucide-react[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  // LMU_UI_PORT / LMU_API_PORT let a second checkout (a worktree) run beside the main one.
  server: {
    port: Number(process.env.LMU_UI_PORT) || 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.LMU_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
