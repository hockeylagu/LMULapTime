import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/recharts/')) {
            return 'recharts';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'lucide';
          }
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
