// tests/playwright/navigation.spec.js
// E2E tests for sidebar navigation and page transitions in the HQ portal.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('HQ Portal Navigation', () => {
  test.beforeEach(async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
  });

  test('sidebar shows all nav items for master_admin', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Locations/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Services/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Users/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/i })).toBeVisible();
  });

  test('navigating to Services highlights the Services nav item', async ({ page }) => {
    await goTo(page, 'Services');
    await expect(page.locator('.nav-item.active')).toContainText('Services');
  });

  test('navigating to Users highlights the Users nav item', async ({ page }) => {
    await goTo(page, 'Users');
    await expect(page.locator('.nav-item.active')).toContainText('Users');
  });

  test('navigating to Settings highlights the Settings nav item', async ({ page }) => {
    await goTo(page, 'Settings');
    await expect(page.locator('.nav-item.active')).toContainText('Settings');
  });

  test('navigating back to Locations highlights the Locations nav item', async ({ page }) => {
    await goTo(page, 'Services');
    await goTo(page, 'Locations');
    await expect(page.locator('.nav-item.active')).toContainText('Locations');
  });

  test('sidebar shows branding elements', async ({ page }) => {
    await expect(page.locator('.sidebar-logo, .sidebar-brand').first()).toBeVisible();
  });
});

test.describe('Admin Navigation (restricted)', () => {
  test('regular admin cannot see Users nav item', async ({ page }) => {
    const { admin } = getTokens();
    await page.goto('/');
    await signInAs(page, admin);

    await expect(page.getByRole('button', { name: /Locations/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Services/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/i })).toBeVisible();
    // Users should NOT be visible for regular admin
    await expect(page.getByRole('button', { name: /^Users$/i })).not.toBeVisible({ timeout: 5000 });
  });
});
