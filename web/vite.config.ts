import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// dev 프록시가 붙일 식약처·식품안전나라 키. Node 쪽에서만 읽어 클라이언트 번들에는 들어가지 않는다
// (클라이언트 코드는 이 값을 참조하지 않음). 배포본은 Pages Function이 Secret으로 붙인다.
const env = loadEnv('development', fileURLToPath(new URL('.', import.meta.url)), '')
const NEDRUG_KEY = env.VITE_NEDRUG_API_KEY ?? ''
const FOODSAFETY_KEY = env.VITE_FOODSAFETY_API_KEY ?? ''

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
        rewrite: (path) => {
          const [pathname, query = ''] = path.replace(/^\/api\/nedrug/, '').split('?')
          return `${pathname}?serviceKey=${NEDRUG_KEY}${query ? `&${query}` : ''}`
        },
      },
      '/api/foodsafety': {
        target: 'http://openapi.foodsafetykorea.go.kr',
        changeOrigin: true,
        // /api/foodsafety/api/<서비스>/... → /api/<키>/<서비스>/...
        rewrite: (path) => path.replace(/^\/api\/foodsafety\/api\//, `/api/${FOODSAFETY_KEY}/`),
      },
    },
  },
})
