import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to /login', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('login page shows continue with google button', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
});
