import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PillCheck — 약·영양제 상호작용 체크',
        short_name: 'PillCheck',
        description: '바코드 한 번에 영양제·일반약과 복용 중 약의 상호작용을 확인하세요.',
        theme_color: '#1B5E20',
        background_color: '#FAFAFA',
        display: 'standalone',
        start_url: '/',
        lang: 'ko-KR',
        icons: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api/nedrug': {
        target: 'http://apis.data.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nedrug/, ''),
      },
      '/api/foodsafety': {
        target: 'http://openapi.foodsafetykorea.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/foodsafety/, ''),
      },
    },
  },
})
