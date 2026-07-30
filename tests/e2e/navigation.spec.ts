import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const MAIN = 'https://www.laura-giova.be';
const PHOTOS = 'https://photos.laura-giova.be';

const ROUTES = [
  { name: 'accueil principal', url: `${MAIN}/` },
  { name: 'accueil animations', url: `${PHOTOS}/accueil` },
  { name: 'appareil photo', url: `${PHOTOS}/appareil/` },
  { name: 'Hit & Kiss', url: `${PHOTOS}/hit-kiss/` },
  { name: 'puzzle Notre histoire', url: `${PHOTOS}/puzzle` },
  { name: 'défis photo', url: `${PHOTOS}/defis/` },
  { name: 'classement photo', url: `${PHOTOS}/classement/` },
  { name: 'récompenses photo', url: `${PHOTOS}/recompenses/` }
];

async function installIdentity(context: BrowserContext) {
  const value = encodeURIComponent(JSON.stringify({
    firstName: 'Test',
    lastName: 'Mariage',
    table: '99'
  }));

  await context.addCookies([
    {
      name: 'lg_identity',
      value,
      domain: '.laura-giova.be',
      path: '/',
      secure: true,
      sameSite: 'Lax'
    }
  ]);
}

async function expectHealthyPage(page: Page, url: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, `Aucune réponse reçue pour ${url}`).not.toBeNull();
  expect(response!.status(), `${url} renvoie HTTP ${response!.status()}`).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
  expect(errors, `Erreurs JavaScript sur ${url}`).toEqual([]);
}

test.beforeEach(async ({ context }) => {
  await installIdentity(context);
});

for (const route of ROUTES) {
  test(`${route.name} répond sans erreur`, async ({ page }) => {
    await expectHealthyPage(page, route.url);
  });
}

test('les trois cartes de l’accueil pointent vers les bonnes animations', async ({ page }) => {
  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });

  const camera = page.getByRole('link', { name: /appareil photo/i });
  const hitKiss = page.getByRole('link', { name: /hit & kiss/i });
  const puzzle = page.getByRole('link', { name: /notre histoire/i });

  await expect(camera).toHaveAttribute('href', /\/appareil\/?/);
  await expect(hitKiss).toHaveAttribute('href', /photos\.laura-giova\.be\/hit-kiss\/?/);
  await expect(puzzle).toHaveAttribute('href', /\/puzzle\/?/);
});

test('accueil vers puzzle conserve la destination', async ({ page }) => {
  await page.goto(`${PHOTOS}/accueil`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /notre histoire/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/puzzle\/?(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: /notre histoire en 21 photos/i })).toBeVisible();
});

test('le puzzle ouvre son classement interne', async ({ page }) => {
  await page.goto(`${PHOTOS}/puzzle`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^classement$/i }).click();
  await expect(page.getByRole('heading', { name: /meilleurs détectives/i })).toBeVisible();
});

test('le puzzle revient à la liste des animations', async ({ page }) => {
  await page.goto(`${PHOTOS}/puzzle`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /toutes les animations/i }).click();
  await expect(page).toHaveURL(/photos\.laura-giova\.be\/accueil\/?$/);
});

test('les pages photo exposent les destinations attendues', async ({ page }) => {
  await page.goto(`${PHOTOS}/appareil/`, { waitUntil: 'domcontentloaded' });

  const expected = [
    { label: /défis/i, path: '/defis/' },
    { label: /classement/i, path: '/classement/' },
    { label: /récompenses/i, path: '/recompenses/' }
  ];

  for (const item of expected) {
    const link = page.getByRole('link', { name: item.label }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toContain(item.path);
  }
});

test('aucun lien visible des pages principales ne renvoie une erreur HTTP', async ({ page, request }) => {
  for (const route of ROUTES) {
    await page.goto(route.url, { waitUntil: 'domcontentloaded' });
    const hrefs = await page.locator('a[href]').evaluateAll(nodes =>
      nodes
        .map(node => (node as HTMLAnchorElement).href)
        .filter(href => href.startsWith('https://www.laura-giova.be') || href.startsWith('https://photos.laura-giova.be'))
    );

    for (const href of [...new Set(hrefs)]) {
      const response = await request.get(href, { maxRedirects: 10 });
      expect(response.status(), `${route.name} contient un lien cassé : ${href}`).toBeLessThan(400);
    }
  }
});
