// tests/playwright/helpers.js
// Shared utilities for Playwright E2E tests.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getTokens() {
  return JSON.parse(readFileSync(resolve(__dirname, '.auth/tokens.json'), 'utf8'));
}

/**
 * Signs the browser into the HQ portal using a Firebase custom token.
 * The token is injected via window.__signInWithToken__ which is exposed
 * by src/firebase.js when VITE_USE_EMULATOR=true.
 */
export async function signInAs(page, token) {
  // Wait for the Firebase SDK to initialise and expose the test helper
  await page.waitForFunction(() => typeof window.__signInWithToken__ === 'function', {
    timeout: 10000,
  });
  await page.evaluate((t) => window.__signInWithToken__(t), token);
  // Wait for the HQ portal sidebar to appear
  await page.waitForSelector('.sidebar-nav', { timeout: 10000 });
}

/** Navigate to a portal section via the sidebar. */
export async function goTo(page, label) {
  await page.getByRole('button', { name: label, exact: false }).click();
}
