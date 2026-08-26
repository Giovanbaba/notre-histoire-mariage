import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://notre-histoire-mariage.giovanni-fragapane.workers.dev';
const baseUrl = new URL(BASE);

async function installIdentity(context: BrowserContext) {
  const value = encodeURIComponent(JSON.stringify({ firstName: 'Cloud', lastName: 'Test', table: '99' }));
  await context.addCookies([
    {
      name: 'lg_identity',
      value,
      domain: baseUrl.hostname,
      path: '/',
      secure: baseUrl.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

async function expectHealthyPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  expect(response, `Aucune réponse pour ${path}`).not.toBeNull();
  expect(response!.status(), `${path} renvoie HTTP ${response!.status()}`).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
  expect(errors, `Erreurs JS sur ${path}`).toEqual([]);
}

test('connexion Cloudflare conserve l’identité', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(`${BASE}/connexion/?next=/accueil`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Cloud');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Test');
  await page.getByRole('textbox', { name: 'Nom ou numéro de table' }).fill('99');
  await page.getByRole('button', { name: /accéder aux animations/i }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/accueil/?$`));
  await expect(page.getByText(/Cloud Test/i)).toBeVisible();
});

test.describe('avec identité', () => {
  test.beforeEach(async ({ context }) => installIdentity(context));

  for (const path of ['/accueil', '/appareil/', '/hit-kiss/', '/puzzle', '/defis/', '/classement/', '/recompenses/']) {
    test(`${path} répond sans erreur`, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }

  test('les trois cartes de l’accueil ouvrent les bonnes pages', async ({ page }) => {
    await page.goto(`${BASE}/accueil`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /appareil photo/i })).toHaveAttribute('href', /\/appareil\/?/);
    await expect(page.getByRole('link', { name: /hit & kiss/i })).toHaveAttribute('href', /hit-kiss/);
    await expect(page.getByRole('link', { name: /notre histoire/i })).toHaveAttribute('href', /\/puzzle\/?/);
  });

  test('Notre histoire démarre et ouvre le classement', async ({ page }) => {
    await page.goto(`${BASE}/puzzle`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /notre histoire en 21 photos/i })).toBeVisible();
    await page.getByRole('button', { name: /commencer le jeu/i }).click();
    await expect(page.getByText(/remettez les souvenirs dans l’ordre/i)).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^classement$/i }).click();
    await expect(page.getByRole('heading', { name: /meilleurs détectives/i })).toBeVisible();
  });

  test('Hit & Kiss charge son interface et son backend Socket.IO répond', async ({ page, request }) => {
    await page.goto(`${BASE}/hit-kiss/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#app')).toBeVisible();
    const response = await request.get(`${BASE}/socket.io/?EIO=4&transport=polling&t=e2e`);
    expect(response.status()).toBeLessThan(400);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('Cloudflare R2 est connecté en lecture', async ({ request }) => {
    const response = await request.get(`${BASE}/api/cloudflare-health`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.r2Connected).toBe(true);
  });

  test('Cloudflare R2 passe un test écriture/lecture/suppression', async ({ request }) => {
    const response = await request.get(`${BASE}/api/cloudflare-self-test`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.r2ReadWriteDelete).toBe(true);
  });
});
