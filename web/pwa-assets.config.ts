import {
  appleSplashScreenSizes,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// 홈 화면 아이콘 PNG와 iOS 시작 화면을 public/icon.svg에서 만든다: npm run generate-pwa-assets
// 생성된 PNG는 public/에 커밋한다. 아이콘 그림을 바꾸면 이 명령을 다시 돌린다.
// 시작 화면 <link> 줄은 명령이 출력하는 것을 index.html에 옮겨 적는다.
// 원본은 모서리가 둥근 인디고 사각형이라, 아이폰(모서리를 기기가 깎음)과
// 안드로이드 마스커블(기기가 원·사각으로 자름)은 여백 없이 인디고로 꽉 채운다.
// 캡슐은 가운데 반지름 150px 안에 있어 마스커블 안전 영역(반지름 205px) 안에 든다.
const ICON_BG = '#4A4FD0'
// 시작 화면 바탕 = 앱 바탕(App.css --pc-bg). 앱 기본 테마가 라이트라 다크 시작 화면은 만들지 않는다
const SPLASH_BG = '#F8F4EE'

// 생성기(0.2.6) 목록은 iPhone 14까지라 그 뒤 새 화면 크기를 더한다. 같은 크기는 한 장으로 합친다.
// 아이패드는 넣지 않는다(매장에서 폰으로 쓰는 앱, 파일 수를 줄임).
const iphoneSizes = [
  ...Object.entries(appleSplashScreenSizes)
    .filter(([name]) => name.startsWith('iPhone') || name.startsWith('iPod'))
    .map(([, size]) => size),
  { width: 1206, height: 2622, scaleFactor: 3 }, // iPhone 16 Pro, 17, 17 Pro
  { width: 1320, height: 2868, scaleFactor: 3 }, // iPhone 16 Pro Max, 17 Pro Max
  { width: 1260, height: 2736, scaleFactor: 3 }, // iPhone Air
]
const uniqueSizes = iphoneSizes.filter(
  (s, i) => iphoneSizes.findIndex((o) => o.width === s.width && o.height === s.height) === i,
)

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { background: ICON_BG },
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { background: ICON_BG },
    },
    appleSplashScreens: {
      sizes: uniqueSizes,
      padding: 0.6,
      resizeOptions: { background: SPLASH_BG, fit: 'contain' },
      png: { compressionLevel: 9, quality: 60 },
      linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
      // 0.2.6은 기본 이름이 파일(light- 없음)과 출력 링크(light- 붙음)에서 달라 직접 정한다
      name: (landscape, size) =>
        `apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
    },
  },
  images: ['public/icon.svg'],
})
