import { expect, test, type Locator, type Page } from '@playwright/test';

const furniture = (page: Page) => page.getByTestId('furniture');
const byName = (page: Page, name: string) => page.locator(`[data-testid="furniture"][data-name="${name}"]`);

async function attr(loc: Locator, name: string): Promise<number> {
  return Number(await loc.getAttribute(`data-${name}`));
}

/** Drag an element by (dx, dy) screen pixels using real mouse events. */
async function dragBy(page: Page, loc: Locator, dx: number, dy: number) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(furniture(page)).toHaveCount(7);
});

test('loads the seed layout', async ({ page }) => {
  await expect(page.getByTestId('opening-door')).toHaveCount(1);
  await expect(page.getByTestId('opening-window')).toHaveCount(1);
  await expect(page.getByTestId('dim-wall-0')).toHaveText('360 cm');
  await expect(page.getByTestId('dim-wall-1')).toHaveText('330 cm');
  const bed = byName(page, 'Queen bed frame');
  expect(await attr(bed, 'x')).toBe(45);
  expect(await attr(bed, 'y')).toBe(0);
  expect(await attr(byName(page, 'Bedside table'), 'x')).toBe(0);
  expect(await attr(byName(page, 'Bedside table 2'), 'x')).toBe(215);
  // Nothing in the seed layout overlaps.
  await expect(page.locator('[data-testid="furniture"][data-collides="true"]')).toHaveCount(0);
});

test('add, drag, rotate, delete and undo an item', async ({ page }) => {
  // Add
  await page.getByTestId('preset-armchair').click();
  await expect(furniture(page)).toHaveCount(8);
  const chair = byName(page, 'Armchair');
  await expect(chair).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('prop-name')).toHaveValue('Armchair');

  // Drag
  const x0 = await attr(chair, 'x');
  const y0 = await attr(chair, 'y');
  await dragBy(page, chair, -40, 30);
  await expect.poll(() => attr(chair, 'x')).not.toBe(x0);
  expect(await attr(chair, 'y')).not.toBe(y0);
  expect(await attr(chair, 'x') % 5).toBe(0); // snapped to the 5 cm grid

  // Rotate 45° with the keyboard
  await page.keyboard.press('r');
  await expect(chair).toHaveAttribute('data-rotation', '45');
  // ...and with the buttons
  await page.getByTestId('rotate').click();
  await expect(chair).toHaveAttribute('data-rotation', '90');
  await page.getByTestId('rotate-ccw').click();
  await page.getByTestId('rotate-ccw').click();
  await page.getByTestId('rotate-ccw').click();
  await expect(chair).toHaveAttribute('data-rotation', '315');

  // Delete
  await page.keyboard.press('Delete');
  await expect(furniture(page)).toHaveCount(7);
  await expect(chair).toHaveCount(0);

  // Undo the delete
  await page.keyboard.press('Control+z');
  await expect(furniture(page)).toHaveCount(8);
  await expect(chair).toHaveAttribute('data-rotation', '315');
});

test('editing size applies to the selected item as you type', async ({ page }) => {
  const desk = byName(page, 'Desk');
  const bed = byName(page, 'Queen bed frame');
  await page.locator('[data-testid="item-row"]', { hasText: 'Desk' }).first().click();
  await expect(desk).toHaveAttribute('data-selected', 'true');

  const width = page.getByTestId('prop-width');
  await width.selectText();
  await width.pressSequentially('120');
  // Applied without leaving the field.
  await expect(desk).toHaveAttribute('data-width', '120');
  await page.getByTestId('prop-depth').selectText();
  await page.getByTestId('prop-depth').pressSequentially('60');
  await expect(desk).toHaveAttribute('data-depth', '60');

  // Clicking another item must not carry the typed value over to it.
  await bed.click({ position: { x: 40, y: 60 } });
  await expect(bed).toHaveAttribute('data-selected', 'true');
  await expect(bed).toHaveAttribute('data-width', '170');
  await expect(bed).toHaveAttribute('data-depth', '210');
  await expect(desk).toHaveAttribute('data-width', '120');

  // Each field's typing is one undo step.
  await page.getByTestId('undo').click();
  await expect(desk).toHaveAttribute('data-depth', '50');
  await expect(desk).toHaveAttribute('data-width', '120');
  await page.getByTestId('undo').click();
  await expect(desk).toHaveAttribute('data-width', '100');
});

test('duplicating names the copy automatically', async ({ page }) => {
  await page.getByTestId('preset-armchair').click();
  await page.keyboard.press('Control+d');
  await expect(byName(page, 'Armchair 2')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('prop-name')).toHaveValue('Armchair 2');
  await page.keyboard.press('Control+d');
  await expect(byName(page, 'Armchair 3')).toHaveCount(1);

  // Adding from the library also numbers a taken name.
  await page.getByTestId('preset-armchair').click();
  await expect(page.getByTestId('prop-name')).toHaveValue('Armchair 4');
  await page.getByTestId('preset-desk').click();
  await expect(page.getByTestId('prop-name')).toHaveValue('Desk 2');
});

test('dragging an item onto another marks both as colliding', async ({ page }) => {
  const chair = byName(page, 'Desk chair');
  await dragBy(page, chair, 0, -80);
  await expect(chair).toHaveAttribute('data-collides', 'true');
  await expect(byName(page, 'Queen bed frame')).toHaveAttribute('data-collides', 'true');
});

test('items cannot be dragged outside the room', async ({ page }) => {
  const dresser = byName(page, 'Dresser');
  await dragBy(page, dresser, -400, 400);
  await expect.poll(() => attr(dresser, 'x')).toBe(0);
  expect(await attr(dresser, 'y')).toBe(290);
});

test('autosave keeps changes after a reload', async ({ page }) => {
  await page.getByTestId('preset-bookshelf').click();
  const shelf = byName(page, 'Bookshelf');
  await expect(shelf).toHaveCount(1);
  await dragBy(page, shelf, 30, 20);
  await page.keyboard.press('r');
  await expect(shelf).toHaveAttribute('data-rotation', '45');
  const x = await attr(shelf, 'x');
  const y = await attr(shelf, 'y');

  await page.reload();
  await expect(furniture(page)).toHaveCount(8);
  const reloaded = byName(page, 'Bookshelf');
  expect(await attr(reloaded, 'x')).toBe(x);
  expect(await attr(reloaded, 'y')).toBe(y);
  await expect(reloaded).toHaveAttribute('data-rotation', '45');
});

test('room shapes: pick an L-shape, drag a wall, undo', async ({ page }) => {
  await page.getByTestId('shape-l').click();
  const dims = page.locator('[data-testid^="dim-wall-"]');
  await expect(dims).toHaveCount(6);
  // The cut-away corner is 162 cm wide (wall 2), and the right wall (3) is 330 - 149 = 181 cm.
  await expect(page.getByTestId('dim-wall-2')).toHaveText('162 cm');
  await expect(page.getByTestId('dim-wall-3')).toHaveText('181 cm');

  // Furniture that was in the cut-away corner has been moved inside the room.
  const wardrobe = byName(page, 'Wardrobe 2-door');
  expect(await attr(wardrobe, 'y')).toBeGreaterThanOrEqual(149);

  // Drag the right wall outward: the walls joining it get longer.
  await dragBy(page, page.getByTestId('wall-3'), 60, 0);
  await expect(page.getByTestId('dim-wall-2')).not.toHaveText('162 cm');
  const widened = await page.getByTestId('dim-wall-2').textContent();
  expect(parseFloat(widened!)).toBeGreaterThan(162);
  await expect(page.getByTestId('wall-length')).toBeVisible();

  // Type a wall length.
  await page.getByTestId('wall-length').fill('200');
  await page.getByTestId('wall-length').press('Enter');
  await expect(page.getByTestId('dim-wall-3')).toHaveText('200 cm');

  // The shape is autosaved.
  await page.reload();
  await expect(dims).toHaveCount(6);
  await expect(page.getByTestId('dim-wall-3')).toHaveText('200 cm');

  // Undo history doesn't survive a reload, so make the edits again and undo them.
  await dragBy(page, page.getByTestId('wall-3'), 60, 0);
  await expect(page.getByTestId('dim-wall-2')).not.toHaveText(widened!);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('dim-wall-2')).toHaveText(widened!);
});
