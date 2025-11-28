import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      // Development proxy: forward requests starting with /vendedores to the backend
      '/vendedores': {
        target: 'http://192.168.0.50:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/vendedores/, '/vendedores')
      },
      // Proxy route_detail ventas endpoint used by the app
      '/route_detail': {
        target: 'http://192.168.0.50:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/route_detail/, '/route_detail')
      },
      // Optional: proxy a cualquier otra API bajo /api
      '/api': {
        target: 'http://192.168.0.50:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  }
})
