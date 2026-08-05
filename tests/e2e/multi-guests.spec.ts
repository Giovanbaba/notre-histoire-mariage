import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PHOTOS = 'https://photos.laura-giova.be';

type Guest = {
  firstName: string;
  lastName: string;
  table: string;
};

const guests: Guest[] = [
  { firstName: 'Alice', lastName: 'Test', table: '1' },
  { firstName: 'Benoît', lastName: 'Test', table: '2' },
  { firstName: 'Chloé', lastName: 'Test', table: '5' },
  { firstName: 'David', lastName: 'Test', table: '8' }
];

async function createGuestContext(browser: Browser, guest: Guest) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${PHOTOS}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await context.clearCookies();
  await page.reload({ waitUntil: 'domcontentloaded' });

  const inputs = page.locator('input:visible');
  await expect(inputs).toHaveCount(3);
  await inputs.nth(0).fill(guest.firstName);
  await inputs.nth(1).fill(guest.lastName);
  await inputs.nth(2).fill(guest.table);
  await inputs.nth(2).press('Enter');

  await expect(page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Table ${guest.table}`, { exact: false })).toBeVisible();

  return { context, page };
}

async function readIdentity(context: BrowserContext) {
  const cookie = (await context.cookies(PHOTOS)).find(item => item.name === 'lg_identity');
  expect(cookie, 'Chaque invité doit posséder son propre cookie lg_identity').toBeDefined();
  return JSON.parse(decodeURIComponent(cookie!.value)) as Guest;
}

async function checkMainRoutes(page: Page, guest: Guest) {
  const routes = ['/accueil', '/puzzle', '/appareil/', '/hit-kiss/'];

  for (const route of routes) {
    const response = await page.goto(`${PHOTOS}${route}`, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} doit répondre sans erreur`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  }

  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(`${guest.firstName} ${guest.lastName}`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Table ${guest.table}`, { exact: false })).toBeVisible();
}

test('plusieurs invités conservent des identités totalement séparées', async ({ browser }) => {
  const sessions = await Promise.all(guests.map(guest => createGuestContext(browser, guest)));

  try {
    const identities = await Promise.all(sessions.map(({ context }) => readIdentity(context)));
    expect(identities).toEqual(guests);

    await Promise.all(
      sessions.map(({ page }, index) => checkMainRoutes(page, guests[index]))
    );

    for (let index = 0; index < sessions.length; index += 1) {
      const { page, context } = sessions[index];
      const ownGuest = guests[index];
      const foreignGuests = guests.filter((_, guestIndex) => guestIndex !== index);

      await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(`${ownGuest.firstName} ${ownGuest.lastName}`, { exact: false })).toBeVisible();

      const identity = await readIdentity(context);
      expect(identity).toEqual(ownGuest);

      for (const foreignGuest of foreignGuests) {
        await expect(page.getByText(`${foreignGuest.firstName} ${foreignGuest.lastName}`, { exact: false })).toHaveCount(0);
      }
    }
  } finally {
    await Promise.all(sessions.map(({ context }) => context.close()));
  }
});

test('changer une identité ne modifie pas les autres invités', async ({ browser }) => {
  const first = await createGuestContext(browser, guests[0]);
  const second = await createGuestContext(browser, guests[1]);
  const updatedGuest: Guest = { ...guests[0], firstName: 'Alicia' };

  try {
    await first.page.goto(`${PHOTOS}/?change=1`, { waitUntil: 'domcontentloaded' });

    const inputs = first.page.locator('input:visible');
    await expect(inputs).toHaveCount(3);
    await inputs.nth(0).fill(updatedGuest.firstName);
    await inputs.nth(2).press('Enter');

    await expect(first.page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);
    expect(await readIdentity(first.context)).toEqual(updatedGuest);
    await expect(first.page.getByText('Alicia Test', { exact: false })).toBeVisible();
    await expect(first.page.getByText('Alice Test', { exact: false })).toHaveCount(0);

    await second.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(second.page.getByText('Benoît Test', { exact: false })).toBeVisible();
    expect(await readIdentity(second.context)).toEqual(guests[1]);
  } finally {
    await first.context.close();
    await second.context.close();
  }
});
