import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のプロジェクトサイトは /<リポジトリ名>/ 配下で配信される
const base = process.env.BASE_PATH ?? '/cloud-soudan/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'クラウド相談室（仮）',
        short_name: 'クラウド相談室',
        description: 'AWS SAA-C03 の学習用シナリオゲーム（非公式）',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
});
