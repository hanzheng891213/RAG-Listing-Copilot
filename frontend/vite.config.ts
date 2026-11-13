import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    // 开发时按住 Alt + Shift 悬停/点击页面元素，自动在 VSCode 中打开对应源码位置（仅 dev 生效）
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey', 'shiftKey'],
    }),
    vue(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: 'localhost',
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '',
      },
    },
  },
})
