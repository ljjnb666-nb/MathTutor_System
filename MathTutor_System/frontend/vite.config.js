import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // 允许外部访问，Cpolar 内网穿透需要
    allowedHosts: true, // 允许所有 Host，解决 Cpolar/Ngrok 报错 "This host is not allowed"
    fs: {
      // 允许访问上级目录，以便加载 家教/node_modules 下的 KaTeX 字体（403 修复）
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '..'),
        path.resolve(__dirname, '../..'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
        configure(proxy) {
          proxy.on('error', (err, req, res) => {
            const isReset = err.code === 'ECONNRESET' || (err.message && String(err.message).includes('ECONNRESET'))
            if (isReset) {
              console.warn('[proxy] 连接被重置:', req.url, '- 请确认后端已启动 (uvicorn app.main:app --reload) 且未阻塞')
            } else {
              console.error('[proxy]', err.message || err)
            }
          })
        },
      },
    },
  },
})
