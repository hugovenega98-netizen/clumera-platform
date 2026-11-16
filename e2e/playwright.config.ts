import { defineConfig, devices } from '@playwright/test';

/** Los servidores los levanta run.ts; acá solo se definen los navegadores. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /lab|pwa|permissions|layout|identidad/ },
    { name: 'angosto', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } }, testMatch: /lab/ },
  ],
});
