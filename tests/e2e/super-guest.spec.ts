import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const PHOTOS = 'https://photos.laura-giova.be';

const guest = {
  firstName: 'Robot',
  lastName: 'Invité',
  table: '98'
};

async function installIdentity(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'lg_identity',
      value: encodeURIComponent(JSON.stringify(guest)),
      domain: '.laura-giova.be',
      path: '/',
      secure: true,
      sameSite: 'Lax'
    }
  ]);
}

async function assertHealthy(page: Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await expect(page.locator('body')).toBeVisible();
  expect(pageErrors, 'La page ne doit pas produire d’erreur JavaScript').toEqual([]);
}

async function expectIdentity(context: BrowserContext) {
  const cookie = (await context.cookies(PHOTOS)).find(item => item.name === 'lg_identity');
  expect(cookie, 'L’identité doit rester enregistrée').toBeDefined();
  expect(JSON.parse(decodeURIComponent(cookie!.value))).toEqual(guest);
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await installIdentity(context);
});

test('robot invité : traverse les trois animations et conserve son identité', async ({ page, context }) => {
  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
  await assertHealthy(page);
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();

  const cameraLink = page.locator('a[href*="/appareil/"]').first();
  const hitKissLink = page.locator('a[href*="/hit-kiss/"]').first();
  const puzzleLink = page.locator('a[href*="/puzzle"]').first();

  await expect(cameraLink).toBeVisible();
  await expect(hitKissLink).toBeVisible();
  await expect(puzzleLink).toBeVisible();

  await cameraLink.click();
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/appareil\/?/);
  await assertHealthy(page);
  await expectIdentity(context);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);

  await page.locator('a[href*="/hit-kiss/"]').first().click();
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/hit-kiss\/?/);
  await assertHealthy(page);
  await expectIdentity(context);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);

  await page.locator('a[href*="/puzzle"]').first().click();
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/puzzle\/?$/);
  await expect(page.getByRole('heading', { name: /notre histoire en 21 photos/i })).toBeVisible();
  await expectIdentity(context);
});

test('robot invité : le bouton retour conserve le bon parcours', async ({ page }) => {
  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href*="/appareil/"]').first().click();
  await expect(page).toHaveURL(/\/appareil\/?/);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/accueil\/?$/);

  await page.locator('a[href*="/puzzle"]').first().click();
  await expect(page).toHaveURL(/\/puzzle\/?$/);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/accueil\/?$/);
  await expect(page.getByRole('heading', { name: /choisissez votre animation/i })).toBeVisible();
});

test('robot invité : les fonctions photo restent réservées aux pages photo', async ({ page }) => {
  await page.goto(`${PHOTOS}/appareil/`, { waitUntil: 'domcontentloaded' });

  for (const path of ['/defis/', '/classement/', '/recompenses/']) {
    const link = page.locator(`a[href*="${path}"]`).first();
    await expect(link, `Le lien ${path} doit être visible sur l’appareil photo`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/')));
    await assertHealthy(page);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/appareil\/?/);
  }

  await page.goto(`${PHOTOS}/puzzle`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href*="/defis/"]')).toHaveCount(0);
  await expect(page.locator('a[href*="/recompenses/"]')).toHaveCount(0);
});

test('robot invité : changer d’identité rouvre bien le formulaire', async ({ page, context }) => {
  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
  const changeLink = page.locator('a[href*="change=1"]').first();
  await expect(changeLink).toBeVisible();
  await changeLink.click();

  await expect(page).toHaveURL(/change=1/);
  await expect(page.locator('input:visible')).toHaveCount(3);

  const cookie = (await context.cookies(PHOTOS)).find(item => item.name === 'lg_identity');
  expect(cookie).toBeDefined();
});
