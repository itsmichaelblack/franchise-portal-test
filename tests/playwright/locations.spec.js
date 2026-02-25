// tests/playwright/locations.spec.js
// E2E tests for the Locations section of the HQ portal.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('Locations', () => {
  test.beforeEach(async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
  });

  test('locations page loads and shows the Add Location button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Location/i })).toBeVisible({ timeout: 6000 });
  });

  test('clicking Add Location opens the modal with all required fields', async ({ page }) => {
    await page.getByRole('button', { name: /Add Location/i }).click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Add New Location', { exact: false })).toBeVisible();
    await expect(modal.locator('input[placeholder*="name" i], input[placeholder*="centre" i]').first()).toBeVisible();
    await expect(modal.locator('input[placeholder*="address" i]').first()).toBeVisible();
    await expect(modal.locator('input[placeholder*="email" i]').first()).toBeVisible();
  });

  test('filling the Add Location form and submitting creates a new location card', async ({ page }) => {
    await page.getByRole('button', { name: /Add Location/i }).click();

    const modal = page.locator('.modal');
    await modal.locator('input').nth(0).fill('Playwright Test Centre');
    await modal.locator('input').nth(1).fill('1 Test Street, Sydney NSW 2000');
    await modal.locator('input[type="email"], input[placeholder*="email" i]').first().fill('playwright@test.com');
    await modal.locator('input[type="tel"], input[placeholder*="phone" i]').first().fill('0400000001');

    await modal.getByRole('button', { name: /Create Location|Add Location|Save/i }).click();

    // Modal should close and the new card should appear
    await expect(modal).not.toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Playwright Test Centre')).toBeVisible({ timeout: 8000 });
  });

  test('clicking Edit on a location card opens the modal pre-populated with existing data', async ({ page }) => {
    // Wait for at least one location card to exist (seeded by global setup or previous test)
    const editBtn = page.getByRole('button', { name: /^Edit$/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 8000 });
    await editBtn.click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit', { exact: false })).toBeVisible();
    // The first input should have a pre-filled value (not empty)
    const nameInput = modal.locator('input').nth(0);
    await expect(nameInput).not.toHaveValue('');
  });

  test('master_admin can see the Delete button on location cards', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Delete$/i }).first()).toBeVisible({ timeout: 8000 });
  });

  test('clicking Delete shows a confirmation modal', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /^Delete$/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 8000 });
    await deleteBtn.click();

    const confirmModal = page.locator('.modal');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByRole('button', { name: /Delete/i })).toBeVisible();
    await expect(confirmModal.getByRole('button', { name: /Cancel/i })).toBeVisible();

    // Cancel to avoid deleting test data
    await confirmModal.getByRole('button', { name: /Cancel/i }).click();
    await expect(confirmModal).not.toBeVisible();
  });

  test('regular admin does not see the Delete button on location cards', async ({ page }) => {
    // Sign out and sign in as regular admin
    await page.getByRole('button', { name: /sign out|log out/i }).click();
    const { admin } = getTokens();
    await signInAs(page, admin);

    await expect(page.getByRole('button', { name: /^Delete$/i })).not.toBeVisible({ timeout: 6000 });
  });
});
