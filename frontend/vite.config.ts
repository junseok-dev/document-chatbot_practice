import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // 5173 점유 시 자동 증가 대신 오류 발생 → 항상 같은 포트 보장
  },
})
