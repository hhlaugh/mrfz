import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    // 阶段 1-5 使用的引擎库构建：`npm run build:lib` 仍可产出 dist/game-data.js。
    return { plugins: [react()], build: { lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'game-data' } } };
  }
  // 默认：本地对战 UI 应用构建（阶段 6）。
  return { plugins: [react()] };
});
