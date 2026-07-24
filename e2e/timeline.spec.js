import { expect, test } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="email"]').fill('alice@example.com');
  await page.locator('input[type="password"]').fill('chronos123');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('text=Signed in as')).toBeVisible();
}

async function selectAllProjects(page) {
  const checkboxes = page.locator('input[type="checkbox"]');
  // The project list itself loads asynchronously after login resolves, so
  // counting checkboxes immediately can race a still-empty sidebar and find
  // none at all — wait for the real list to render first.
  await expect(checkboxes.first()).toBeVisible();
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
    await expect(checkboxes.nth(i)).toBeChecked();
  }
  // Wait for at least one event bubble to render before tests proceed.
  await expect(page.locator('[role="group"][aria-label*="timeline" i] button[title]').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await selectAllProjects(page);
});

test('zoom controls update the semantic zoom label', async ({ page }) => {
  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  const zoomLabel = page.locator('span[title*="Zoom:"]');
  const before = await zoomLabel.innerText();

  await timeline.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('+');

  await expect(zoomLabel).not.toHaveText(before);
});

test('arrow keys pan the timeline when it is focused', async ({ page }) => {
  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  await timeline.focus();
  const before = await timeline.evaluate((el) => el.scrollLeft);

  await page.keyboard.press('ArrowRight');

  await expect.poll(() => timeline.evaluate((el) => el.scrollLeft)).not.toBe(before);
});

test('double-clicking empty timeline space opens the new-event form with that date pre-filled', async ({ page }) => {
  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  const box = await timeline.boundingBox();

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height - 20);

  await expect(page.getByRole('heading', { name: 'New Event' })).toBeVisible();
  const dateValue = await page.locator('label:has-text("Date") ~ div input[type="date"]').inputValue();
  expect(dateValue).not.toBe('');
});

test('the minimap viewport window shrinks proportionally when zooming in', async ({ page }) => {
  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  const minimap = page.locator('[role="scrollbar"]');
  const viewportWindow = minimap.locator('div.bg-violet-400\\/20');

  const widthBefore = (await viewportWindow.boundingBox()).width;

  await timeline.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('+');

  await expect.poll(async () => (await viewportWindow.boundingBox()).width).toBeLessThan(widthBefore);
});

test('clicking the minimap navigates the main timeline', async ({ page }) => {
  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  const minimap = page.locator('[role="scrollbar"]');
  const before = await timeline.evaluate((el) => el.scrollLeft);
  const box = await minimap.boundingBox();

  // Locator.click() (unlike a raw page.mouse.click() at absolute coordinates)
  // scrolls the target into view first — needed now that the footer sits
  // below the fold on a standard-height viewport.
  await minimap.click({ position: { x: box.width * 0.9, y: box.height / 2 } });

  await expect.poll(() => timeline.evaluate((el) => el.scrollLeft)).not.toBe(before);
});

test('opening a cluster overflow popover and selecting an event opens its detail modal', async ({ page }) => {
  const sameDate = '2026-08-15';

  // Seed enough same-day events (on top of the one already seeded for this date
  // in server/db/seed.js) to force an overflow badge, well past however many
  // individual cards a cluster shows before collapsing (see MAX_VISIBLE_STACK
  // in Timeline.vue) so this doesn't sit right on the boundary.
  for (let i = 0; i < 6; i++) {
    await page.locator('button', { hasText: 'New Event' }).first().click();
    await page.locator('label:has-text("Title") + input').fill(`Overflow ${i + 1}`);
    await page.locator('label:has-text("Date") ~ div input[type="date"]').fill(sameDate);
    await page.locator('form button[type="submit"]').last().click();
    await expect(page.getByRole('heading', { name: 'New Event' })).toHaveCount(0);
  }

  const timeline = page.locator('[role="group"][aria-label*="timeline" i]');
  await page.locator('input[type="date"]').first().fill(sameDate);
  await page.locator('button[title="Jump to date"]').click();
  await timeline.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('-');
  // Let the 300ms left/top CSS transitions settle before interacting.
  await page.waitForTimeout(400);

  const overflowButton = page.locator('button[aria-haspopup="true"]').first();
  await expect(overflowButton).toBeVisible();
  await overflowButton.click();

  const firstItem = page.locator('[role="menuitem"]').first();
  await expect(firstItem).toBeVisible();
  const itemTitle = await firstItem.locator('span.truncate').innerText();
  await firstItem.click();

  await expect(page.locator('h2').filter({ hasText: itemTitle })).toBeVisible();
});
