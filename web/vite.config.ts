import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '약똑똑',
        short_name: '약똑똑',
        description: '드시는 약과 새로 산 영양제나 일반약을 함께 먹어도 되는지 식약처 자료로 알려 드려요.',
        theme_color: '#F2F4F6',
        background_color: '#F2F4F6',
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
        // 글꼴은 미리 받지 않고(전체 3MB), 처음 쓴 글자 묶음만 보관해 다음부터 오프라인에서도 보인다
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'pillcheck-fonts',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
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
