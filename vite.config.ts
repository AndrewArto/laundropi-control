import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function getGitInfo() {
  try {
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo "dev"').toString().trim();
    const date = execSync('git log -1 --format=%cd --date=short').toString().trim();
    return { tag, date };
  } catch {
    return { tag: 'dev', date: new Date().toISOString().split('T')[0] };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const git = getGitInfo();
  // Use VITE_API_TARGET for proxy target, default to localhost:3001
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3001';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        },
        '/auth': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(git.tag),
      __APP_BUILD_DATE__: JSON.stringify(git.date),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
