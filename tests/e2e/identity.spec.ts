import { expect, test } from '@playwright/test';

const PHOTOS = 'https://photos.laura-giova.be';

const guest = {
  firstName: 'Invité',
  lastName: 'Playwright',
  table: '99'
};

test('un invité crée son identité et la conserve jusqu’au puzzle', async ({ page, context }) => {
  await context.clearCookies();

  await page.goto(`${PHOTOS}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /bienvenue aux jeux du mariage/i })).toBeVisible();

  const identityInputs = page.locator('form.start-form input');
  await expect(identityInputs).toHaveCount(3);
  await identityInputs.nth(0).fill(guest.firstName);
  await identityInputs.nth(1).fill(guest.lastName);
  await identityInputs.nth(2).fill(guest.table);
  await page.getByRole('button', { name: /entrer dans les animations/i }).click();

  await expect(page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Table ${guest.table}`, { exact: false })).toBeVisible();

  const identityCookie = (await context.cookies(PHOTOS)).find(cookie => cookie.name === 'lg_identity');
  expect(identityCookie, 'Le cookie lg_identity doit être créé').toBeDefined();
  expect(JSON.parse(decodeURIComponent(identityCookie!.value))).toEqual(guest);

  const storedIdentity = await page.evaluate(() => ({
    guest: localStorage.getItem('lg-guest'),
    table: localStorage.getItem('lg-table')
  }));
  expect(storedIdentity).toEqual({
    guest: `${guest.firstName} ${guest.lastName}`,
    table: guest.table
  });

  await page.getByRole('link', { name: /notre histoire/i }).click();
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/puzzle\/?$/);
  await expect(page.getByRole('heading', { name: /notre histoire en 21 photos/i })).toBeVisible();
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/photos\.laura-giova\.be\/puzzle\/?$/);
  await expect(page.getByRole('heading', { name: /notre histoire en 21 photos/i })).toBeVisible();
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Table ${guest.table}`, { exact: false })).toBeVisible();
});
