import { test, expect } from '@playwright/test';

test.describe('Éclat — contrôle production', () => {
  test('la vitrine charge sans erreur critique', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveTitle(/Éclat/i);
    await expect(page.getByRole('heading', { name: /Votre histoire/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Créer mon mariage/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('les cinq langues changent réellement l’interface', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'NL', exact: true }).first().click();
    await expect(page.getByText('Mijn huwelijk maken', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'EN', exact: true }).first().click();
    await expect(page.getByText('Create my wedding', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'FR', exact: true }).first().click();
    await expect(page.getByText('Créer mon mariage', { exact: true }).first()).toBeVisible();
  });

  test('le formulaire bloque les données incomplètes', async ({ page }) => {
    await page.goto('/#reserver');
    await page.getByRole('button', { name: /Continuer vers le paiement/i }).click();
    await expect(page.locator(':invalid')).toHaveCount(4);
    await expect(page).toHaveURL(/#reserver$/);
  });

  test('l’API de session multi-mariages est active', async ({ request }) => {
    const response = await request.get('/api/eclat/session');
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  test('une adresse mariage inconnue ne renvoie pas la vitrine Éclat', async ({ page }) => {
    await page.goto('/mariage/bot-inexistant');
    await expect(page.getByText(/mariage introuvable|site indisponible/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Votre histoire/i })).toHaveCount(0);
  });
});
