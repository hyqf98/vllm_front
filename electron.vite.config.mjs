import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ['vue', 'vue-router', 'pinia'],
        dts: resolve('src/type/auto-imports.d.ts'),
        eslintrc: {
          enabled: false,
          filepath: resolve('src/type/auto-imports.eslintrc.json'),
          globalsPropValue: true
        }
      }),
      Components({
        resolvers: [ElementPlusResolver()],
        dts: resolve('src/type/components.d.ts')
      })
    ]
  }
})
