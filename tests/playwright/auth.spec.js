// tests/playwright/auth.spec.js
// E2E tests for authentication and role-based access.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs } from './helpers.js';

test.describe('Authentication', () => {
  test('unauthenticated user sees the portal selector screen', async ({ page }) => {
    await page.goto('/');
    // The portal selector shows HQ and Franchise Partner options
    await expect(page.getByText('HQ Portal', { exact: false })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Franchise Partner', { exact: false })).toBeVisible();
  });

  test('selecting HQ portal shows the Google sign-in button', async ({ page }) => {
    await page.goto('/');
    // Click the HQ portal option
    await page.getByText('HQ Portal', { exact: false }).first().click();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible({ timeout: 6000 });
  });

  test('after signing in as master_admin the HQ portal renders with Locations active', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);

    // Sidebar should be visible with Locations highlighted
    await expect(page.locator('.sidebar-nav')).toBeVisible();
    await expect(page.locator('.nav-item.active')).toContainText('Locations');
  });

  test('after signing in as admin the HQ portal renders correctly', async ({ page }) => {
    const { admin } = getTokens();
    await page.goto('/');
    await signInAs(page, admin);

    await expect(page.locator('.sidebar-nav')).toBeVisible();
    // Regular admin should NOT see the Users nav item
    await expect(page.getByRole('button', { name: /^Users$/ })).not.toBeVisible();
  });

  test('signing out returns the user to the auth page', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);

    // Click logout button
    await page.getByRole('button', { name: /sign out|log out/i }).click();
    // Should return to the portal selector or auth screen
    await expect(page.getByText('HQ Portal', { exact: false })).toBeVisible({ timeout: 8000 });
  });
});
