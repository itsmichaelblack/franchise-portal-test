// tests/playwright/users.spec.js
// E2E tests for the Users section of the HQ portal (master_admin only).

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('Users (master_admin only)', () => {
  test('Users nav item is visible for master_admin', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);

    await expect(page.getByRole('button', { name: /^Users$/i })).toBeVisible();
  });

  test('Users nav item is NOT visible for regular admin', async ({ page }) => {
    const { admin } = getTokens();
    await page.goto('/');
    await signInAs(page, admin);

    // The Users nav button should not appear for non-master admins
    await expect(page.getByRole('button', { name: /^Users$/i })).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking Users navigates to the users management page', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);

    await goTo(page, 'Users');
    // The users page should show an Invite User button
    await expect(page.getByRole('button', { name: /Invite/i })).toBeVisible({ timeout: 6000 });
  });

  test('clicking Invite User opens the invite modal with email and role fields', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
    await goTo(page, 'Users');

    await page.getByRole('button', { name: /Invite/i }).click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('input[type="email"], input[placeholder*="email" i]').first()).toBeVisible();
  });

  test('existing HQ users are listed on the users page', async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
    await goTo(page, 'Users');

    // The E2E admin user seeded in global-setup should appear
    await expect(page.getByText('E2E Admin', { exact: false })).toBeVisible({ timeout: 8000 });
  });
});
