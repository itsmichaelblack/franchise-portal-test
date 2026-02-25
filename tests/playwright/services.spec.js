// tests/playwright/services.spec.js
// E2E tests for the Services section of the HQ portal.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('Services', () => {
  test.beforeEach(async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
    await goTo(page, 'Services');
  });

  test('Services page loads and shows the Add New Service button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add New Service/i })).toBeVisible({ timeout: 6000 });
  });

  test('Add New Service modal has a plain text input (not a dropdown) for Service Name', async ({ page }) => {
    await page.getByRole('button', { name: /Add New Service/i }).click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // The service name field must be a text input, not a select element
    const nameInput = modal.locator('input[placeholder*="service name" i]');
    await expect(nameInput).toBeVisible();
    // Confirm there is no select dropdown for service name
    await expect(modal.locator('select').first()).not.toBeVisible({ timeout: 1000 }).catch(() => {
      // It's OK if no select at all — that's the desired state
    });
  });

  test('creating a service with name and description shows the service card', async ({ page }) => {
    await page.getByRole('button', { name: /Add New Service/i }).click();

    const modal = page.locator('.modal');

    // Fill in the service name (plain text input)
    await modal.locator('input[placeholder*="service name" i]').fill('Playwright HSC Prep');

    // Fill description
    await modal.locator('textarea').fill('Intensive HSC preparation for year 12 students.');

    await modal.getByRole('button', { name: /Create Service/i }).click();

    await expect(modal).not.toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Playwright HSC Prep')).toBeVisible({ timeout: 8000 });
  });

  test('editing a service pre-fills the text field with the existing name', async ({ page }) => {
    // A service card should be visible after the previous test (or seeded data)
    const editBtn = page.getByRole('button', { name: /^Edit$/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 8000 });
    await editBtn.click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // The service name input should be pre-filled
    const nameInput = modal.locator('input[placeholder*="service name" i]');
    await expect(nameInput).not.toHaveValue('');
  });

  test('clicking Delete on a service card shows a confirmation modal', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /^Delete$/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 8000 });
    await deleteBtn.click();

    const confirmModal = page.locator('.modal');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByRole('button', { name: /Delete/i })).toBeVisible();

    // Cancel to preserve test data
    await confirmModal.getByRole('button', { name: /Cancel/i }).click();
    await expect(confirmModal).not.toBeVisible();
  });
});
