// tests/playwright/activity-logs.spec.js
// E2E tests for the activity log viewing in the HQ portal.

import { test, expect } from '@playwright/test';
import { getTokens, signInAs, goTo } from './helpers.js';

test.describe('Activity Logs', () => {
  test.beforeEach(async ({ page }) => {
    const { master } = getTokens();
    await page.goto('/');
    await signInAs(page, master);
  });

  test('clicking View on a location opens the detail view', async ({ page }) => {
    const viewBtn = page.getByRole('button', { name: /^View$/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 8000 });
    await viewBtn.click();

    // Should see location detail tabs
    await expect(page.getByText('Details', { exact: false })).toBeVisible({ timeout: 6000 });
  });

  test('location detail view shows Details and User Logs tabs', async ({ page }) => {
    const viewBtn = page.getByRole('button', { name: /^View$/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 8000 });
    await viewBtn.click();

    // Both tabs should be visible
    await expect(page.getByText('Details', { exact: false })).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('User Logs', { exact: false })).toBeVisible();
  });

  test('switching to User Logs tab shows the logs section', async ({ page }) => {
    const viewBtn = page.getByRole('button', { name: /^View$/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 8000 });
    await viewBtn.click();

    // Click the User Logs tab
    const userLogsTab = page.getByText('User Logs', { exact: false });
    await expect(userLogsTab).toBeVisible({ timeout: 6000 });
    await userLogsTab.click();

    // Should show some logs-related content (loading or "No logs" or actual logs)
    await expect(
      page.locator('[class*="log"], [class*="Log"]').first()
        .or(page.getByText(/loading|no.*log|sign.in|activity/i).first())
    ).toBeVisible({ timeout: 8000 });
  });

  test('clicking Back from location detail returns to locations list', async ({ page }) => {
    const viewBtn = page.getByRole('button', { name: /^View$/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 8000 });
    await viewBtn.click();

    // Wait for detail view
    await expect(page.getByText('Details', { exact: false })).toBeVisible({ timeout: 6000 });

    // Click back
    const backBtn = page.getByRole('button', { name: /Back|←/i }).first();
    await backBtn.click();

    // Should see the locations list again with Add Location button
    await expect(page.getByRole('button', { name: /Add Location/i })).toBeVisible({ timeout: 6000 });
  });
});
