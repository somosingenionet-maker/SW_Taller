import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env.e2e.local');
} catch {
  // No existe en este entorno (p. ej. CI, donde las variables se inyectan
  // de otra forma) — los tests fallarán con un mensaje claro si faltan.
}

// Los tests E2E corren contra la app real hablando con Supabase de
// PRODUCCIÓN, usando el tenant de pruebas "Taller Ejemplo" (ver
// .env.e2e.local, excluido de git). No hay entorno de staging separado
// (sin Docker local no se puede levantar un Supabase aislado) — por eso
// ningún test debe emitir una factura real: es irreversible y consume la
// numeración de facturas de ese tenant. Las mutaciones se limitan a crear y
// borrar sus propias Órdenes de Trabajo de prueba.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // --mode e2e hace que Vite cargue .env.e2e.local en vez de .env.local
    // (que apunta a un Supabase local inexistente sin Docker) — así el
    // frontend habla con producción, igual que E2E_ADMIN_EMAIL/PASSWORD.
    command: 'npx vite --mode e2e --port=3000 --host=0.0.0.0',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
