// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

async function openCosts(page) {
  await page.getByLabel('Cost assumptions', { exact: true }).click();
}

test('School Atlas offers three ranked cohorts and clears selections on refresh', async ({ page }) => {
  await page.goto('/school-atlas/');
  await expect(page.locator('#school-profile')).toBeHidden();
  await expect(page.locator('#school-list tr')).toHaveCount(100);
  await expect(page.locator('mpr-header')).toBeVisible();
  await expect(page.locator('#site-footer')).toHaveAttribute('menu', /placement/);
  for (const label of ['Lottery/selection', 'Private', 'Local public']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#school-list tr')).toHaveCount(label === 'Private' ? 96 : 100);
  }
  await page.locator('.school-list-section > summary').click();
  await page.locator('#school-list button').first().click();
  await expect(page.locator('#school-profile')).toBeVisible();
  await expect(page.locator('#school-list tr.is-selected')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#school-profile')).toBeHidden();
  await expect(page.locator('#school-list tr.is-selected')).toHaveCount(0);
  await page.locator('.axis-link').click();
  await expect(page.locator('#value-methodology')).toBeVisible();
});

test('valid cost edits persist automatically, invalid edits retain the last valid scenario', async ({ page }) => {
  await page.goto('/school-atlas/');
  await openCosts(page);
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await page.locator('#non-housing-budget').fill('60000');
  await expect(page.locator('#budget-status')).toHaveText('Saved');
  await expect(page.locator('#school-profile')).toBeHidden();
  await page.locator('#student-count').fill('0');
  await expect(page.locator('#budget-status')).toContainText('1–20');
  await expect(page.locator('#student-count')).toHaveValue('0');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('school-atlas-family-scenario-v3')));
  expect(saved).toMatchObject({ nonHousingBudgetUsd: 60000, students: 1 });
  await page.reload();
  await openCosts(page);
  await expect(page.locator('#non-housing-budget')).toHaveValue('60000');
  await expect(page.locator('#student-count')).toHaveValue('1');
});

test('storage failure preserves cost edits and a later valid edit recovers automatically', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'school-atlas-family-scenario-v3' && JSON.parse(value).nonHousingBudgetUsd === 61000) throw new DOMException('Fixture full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/school-atlas/');
  await openCosts(page);
  await page.locator('#non-housing-budget').fill('61000');
  await expect(page.locator('#budget-status')).toContainText('Could not save');
  await expect(page.locator('#non-housing-budget')).toHaveValue('61000');
  await page.locator('#non-housing-budget').fill('62000');
  await expect(page.locator('#budget-status')).toHaveText('Saved');
  await page.reload();
  await openCosts(page);
  await expect(page.locator('#non-housing-budget')).toHaveValue('62000');
});

test('private attendance, sorting, and clear choices preserve the active cohort', async ({ page }) => {
  await page.goto('/school-atlas/');
  await page.getByRole('button', { name: 'Private', exact: true }).click();
  await page.getByRole('button', { name: 'Boarding', exact: true }).click();
  await expect(page.locator('#chart-title')).toHaveText('School rank vs. annual family cost');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('#school-list tr')).toHaveCount(96);
  await page.locator('.school-list-section > summary').click();
  await page.locator('[data-sort="rank"]').click();
  await expect(page.locator('#rank-column')).toHaveAttribute('aria-sort', 'ascending');
  await page.locator('#school-list button').first().click();
  await expect(page.locator('#school-profile')).toBeVisible();
  await page.getByLabel('School or location', { exact: true }).click();
  await page.getByRole('button', { name: 'All schools & locations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#school-profile')).toBeHidden();
  await expect(page.locator('#school-list tr')).toHaveCount(96);
});

for (const width of [390, 1280]) {
  test(`compact explorer fits the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/school-atlas/');
    await expect(page.locator('.school-point').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/school-atlas-${width}.png`, fullPage: true });
  });
}

test('costs update across open views and preserve an invalid local draft', async ({ page, context }) => {
  await page.goto('/school-atlas/');
  await openCosts(page);
  const other = await context.newPage();
  await other.goto('/school-atlas/');
  await openCosts(other);
  await other.locator('#non-housing-budget').fill('63000');
  await expect(other.locator('#budget-status')).toHaveText('Saved');
  await expect(page.locator('#non-housing-budget')).toHaveValue('63000');
  await page.locator('#student-count').fill('0');
  await other.locator('#non-housing-budget').fill('64000');
  await expect(other.locator('#budget-status')).toHaveText('Saved');
  await expect(page.locator('#student-count')).toHaveValue('0');
  await expect(page.locator('#non-housing-budget')).toHaveValue('63000');
  await other.close();
});

test('site navigation remounts the explorer on browser history return', async ({ page }) => {
  await page.goto('/school-atlas/');
  await expect(page.locator('#school-list tr')).toHaveCount(100);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page.locator('#school-list tr')).toHaveCount(100);
  await page.getByRole('button', { name: 'Private', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a valid cost edit stays saved while a newer invalid draft stays visible', async ({ page }) => {
  await page.goto('/school-atlas/');
  await openCosts(page);
  await page.locator('#non-housing-budget').fill('65000');
  await page.locator('#student-count').fill('0');
  await expect(page.locator('#budget-status')).toContainText('1–20');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('school-atlas-family-scenario-v3'))?.nonHousingBudgetUsd)).toBe(65000);
  await expect(page.locator('#student-count')).toHaveValue('0');
  await expect(page.locator('#budget-status')).toContainText('1–20');
});

test('a valid cost edit survives an immediate reload', async ({ page }) => {
  await page.goto('/school-atlas/');
  await openCosts(page);
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('#non-housing-budget').evaluate(input => {
      input.value = '66000';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      location.reload();
    }),
  ]);
  await openCosts(page);
  await expect(page.locator('#non-housing-budget')).toHaveValue('66000');
});

test('a valid cost edit survives immediate navigation away and back', async ({ page }) => {
  await page.goto('/school-atlas/');
  await openCosts(page);
  await page.locator('#non-housing-budget').evaluate(input => {
    input.value = '67000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('a[aria-label="Home"]').click();
  });
  await expect(page).toHaveURL('https://localhost:18443/');
  await expect(page.getByRole('heading', { name: 'Tools, essays, music, and arts.' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('#school-list tr')).toHaveCount(100);
  await openCosts(page);
  await expect(page.locator('#non-housing-budget')).toHaveValue('67000');
});

for (const [filename, title] of [['admissions-audit.html', 'Public admission audit'], ['private-coverage.html', 'Private-school coverage']]) {
  test(`the ${title} link opens its page and returns to the explorer`, async ({ page }) => {
    await page.goto('/school-atlas/');
    await page.locator('#methodology-details > summary').click();
    await page.locator(`#methodology a[href="${filename}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/school-atlas/${filename}$`));
    await expect(page.locator('main h1')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#school-list tr')).toHaveCount(100);
  });
}

for (const width of [390, 1280]) {
  test(`School Atlas is discoverable with companion links and shared navigation at ${width}px`, async ({ page }) => {
    const companion = 'https://vadymtyemirov1.substack.com/p/what-the-school-ranking-leaves-out';
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const card = page.locator('.project-list article').filter({ has: page.getByRole('link', { name: 'School Atlas', exact: true }) });
    await expect(card.getByRole('link', { name: 'Read companion article', exact: true })).toHaveAttribute('href', companion);
    await card.getByRole('link', { name: 'Explore interactive tool', exact: true }).click();
    await expect(page).toHaveURL(/\/school-atlas\/$/);
    await expect(page.locator('#school-list tr')).toHaveCount(100);
    await expect(page.getByRole('heading', { level: 1, name: 'Compare schools', exact: true })).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Page hierarchy', exact: true })).toHaveCount(1);
    const companionLink = page.getByRole('link', { name: 'Read companion article', exact: true });
    await expect(companionLink).toHaveAttribute('href', companion);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('navigation', { name: 'Page hierarchy', exact: true }).getByRole('link', { name: 'Articles', exact: true }).click();
    await page.getByRole('navigation', { name: 'Filter articles', exact: true }).getByRole('button', { name: 'Modeling', exact: true }).click();
    const collectionCard = page.locator('#article-list article').filter({ has: page.getByRole('link', { name: 'School Atlas', exact: true }) });
    await expect(collectionCard).toBeVisible();
    await expect(collectionCard.getByRole('link', { name: 'Read companion article', exact: true })).toHaveAttribute('href', companion);
    await collectionCard.getByRole('link', { name: 'Explore interactive tool', exact: true }).click();
    await expect(page.locator('#school-list tr')).toHaveCount(100);
    await page.reload();
    await expect(page.locator('#school-list tr')).toHaveCount(100);
    const contrast = await companionLink.evaluate(link => {
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => channel / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = luminance(getComputedStyle(link).color);
      const background = luminance(getComputedStyle(link.closest('.mpr-header')).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    for (const filename of ['admissions-audit.html', 'private-coverage.html']) {
      await page.goto(`/school-atlas/${filename}`);
      await expect(page.getByRole('link', { name: 'Read companion article', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Read companion article', exact: true })).toHaveAttribute('href', companion);
    }
  });
}
