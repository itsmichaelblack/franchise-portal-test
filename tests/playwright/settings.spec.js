// tests/playwright/settings.spec.js
// E2E tests for the Settings section of the HQ portal.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
    await goTo(page, 'Settings');
  });

  test('Settings page loads with a YouTube URL input field', async ({ page }) => {
    await expect(page.locator('input[type="url"], input[placeholder*="youtube" i]').first()).toBeVisible({ timeout: 6000 });
  });

  test('updating the YouTube URL and saving shows a success toast', async ({ page }) => {
    const urlInput = page.locator('input[type="url"], input[placeholder*="youtube" i]').first();
    await urlInput.fill('https://www.youtube.com/embed/test-playwright-id');

    await page.getByRole('button', { name: /Save/i }).click();

    // A toast/success message should appear
    await expect(
      page.locator('.toast, [class*="toast"], [class*="snack"]').first()
    ).toBeVisible({ timeout: 6000 });
  });

  test('the Settings nav item is active after navigating to Settings', async ({ page }) => {
    await expect(page.locator('.nav-item.active')).toContainText('Settings');
  });
});
