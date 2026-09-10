// @ts-check
import { test, expect } from '@playwright/test';

test('full article is readable after direct navigation and reload', async ({ page }) => {
  await page.goto('/articles/the-wittgenstein-mirror/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Wittgenstein Mirror');
  await expect(page.getByRole('heading', { name: /The Ruler and the Table/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the original on Substack' })).toHaveAttribute('href', 'https://vadymtyemirov1.substack.com/p/the-wittgenstein-mirror');
  await page.reload();
  await expect(page.locator('.article-body')).toContainText('Wittgenstein');
  expect(await page.locator('.article-body img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
});

test('gallery uses real content paths and survives reload', async ({ page }) => {
  await page.goto('/gallery/exhibits/the-third-act/');
  await expect(page.getByRole('heading', { name: 'The Third Act', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Third Act', exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('homepage points to local articles and has no catalog validation error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Writing', exact: true })).toHaveAttribute('href', '/articles/');
  await expect(page.locator('.essay-list article')).toHaveCount(4);
  await expect(page.locator('.project-list article')).toHaveCount(4);
  await page.locator('.essay-list h2 a').first().click();
  await expect(page).toHaveURL(/\/articles\/the-human-act-of-making-things-exist\/$/);
});
