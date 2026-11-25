import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import type { InputController } from '../apps/game/src/input.ts';
import type { GameClient } from '../apps/game/src/client.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

type FixtureClient = Pick<GameClient, 'state'> & { update(patch: Partial<GameClient['state']>): void };

test('squad identity remains readable across day, night, map and small viewports without changing the world', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const hash = await stateHash(page);
  const initial = await frame(page);
  const ids = initial.squads.filter(q => q.alive).map(q => q.id);
  await page.evaluate(ids => {
    const { input, view } = (window as unknown as { vazante: { input: InputController; view: GameRenderer } }).vazante;
    input.select(ids);
    const q = view.latest!.squads[0];
    view.rig.centerOn(q.anchorX, q.anchorY);
    view.rig.span = view.rig.targetSpan = 55;
  }, ids);
  const first = page.locator(`.squad-label[data-squad-id="${ids[0]}"]`);
  await expect(first).toBeVisible();
  await expect(first).toContainText(`${initial.squads[0].alive}/${initial.squads[0].members.length}`);
  await expect(first).toHaveClass(/selected/);
  expect(await first.evaluate(el => getComputedStyle(el).getPropertyValue('--sq'))).toBe('#5aa9ff');
  expect(await page.locator('.squad:not(.vehicle)').first().evaluate(el => getComputedStyle(el).getPropertyValue('--sq'))).toBe('#5aa9ff');
  const rings = await page.evaluate(() => {
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    const color = view.scene.fog!.color.clone();
    const rings = view.scene.getObjectByName('squad-selection-rings') as unknown as { count: number; getColorAt(i: number, target: typeof color): void };
    return Array.from({ length: rings.count }, (_, i) => { rings.getColorAt(i, color); return `#${color.getHexString()}`; });
  });
  expect(rings).toHaveLength(initial.stats.soldiersAlive);
  expect(new Set(rings)).toEqual(new Set(['#5aa9ff', '#ff8ce6']));

  // Worker frames still arrive while paused. Keep the fixture on the renderer boundary only.
  await page.evaluate(() => {
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    const root = window as unknown as { squadHour?: number; restoreSquadDay?: () => void };
    const push = view.pushFrame.bind(view);
    view.pushFrame = (f, now) => push(root.squadHour === undefined ? f : {
      ...f, day: { lengthS: 1200, startHour: root.squadHour - f.tick / 12000 * 24 },
    }, now);
    root.restoreSquadDay = () => { view.pushFrame = push; };
  });

  for (const strategic of [false, true]) {
    for (const hour of [12, 23]) {
      await page.evaluate(({ hour, strategic }) => {
        const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
        (window as unknown as { squadHour: number }).squadHour = hour;
        view.rig.span = view.rig.targetSpan = strategic ? 600 : 55;
        view.pushFrame(view.latest!, performance.now());
      }, { hour, strategic });
      await expect.poll(() => page.evaluate(() => (window as unknown as { vazante: { view: GameRenderer } }).vazante.view.hours)).toBeCloseTo(hour, 1);
      await expect(first).toBeVisible();
      if (strategic) {
        const markers = await page.evaluate(() => {
          const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
          const color = view.scene.fog!.color.clone();
          const mesh = view.scene.getObjectByName('squad-map-markers') as unknown as { count: number; getColorAt(i: number, target: typeof color): void };
          return Array.from({ length: mesh.count }, (_, i) => { mesh.getColorAt(i, color); return color.getHexString(); });
        });
        expect(markers).toEqual(['ffffff', '5aa9ff', 'ffffff', 'ff8ce6']);
      }
      const labelBox = await first.boundingBox(), objective = await page.locator('.map-label.objective').boundingBox();
      if (objective) expect(labelBox!.x + labelBox!.width <= objective.x || labelBox!.x >= objective.x + objective.width ||
        labelBox!.y + labelBox!.height <= objective.y || labelBox!.y >= objective.y + objective.height).toBe(true);
      await page.screenshot({ path: info.outputPath(`squads-${strategic ? 'map' : 'tactical'}-${hour}.png`) });
      expect(await stateHash(page)).toBe(hash);
    }
  }
  await page.setViewportSize({ width: 800, height: 450 });
  await page.evaluate(() => {
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    view.rig.span = view.rig.targetSpan = 55;
  });
  await expect(first).toBeVisible();
  // These labels never intercept selection, movement, or construction clicks on the canvas.
  const at = await first.boundingBox();
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches('canvas.game'), { x: at!.x + at!.width / 2, y: at!.y + at!.height / 2 })).toBe(true);
  await page.screenshot({ path: info.outputPath('squads-small.png') });
  expect(await stateHash(page)).toBe(hash);
  expect((await frame(page)).stats.soldiersAlive).toBe(initial.stats.soldiersAlive);
  await page.evaluate(() => (window as unknown as { restoreSquadDay: () => void }).restoreSquadDay());
  // Actual TAB entry hides the squad tags; return restores them.
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).not.toBeNull();
  await expect(page.locator('.squad-label:visible')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).toBeNull();
  await expect(first).toBeVisible();
  expect(errors).toEqual([]);
});

test('overlap prioritizes selection and eliminated squads leave no floating identity', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const hash = await stateHash(page);
  const ids = await page.evaluate(() => {
    const { client, view, input } = (window as unknown as { vazante: { client: FixtureClient; view: GameRenderer; input: InputController } }).vazante;
    const f = client.state.frame!, a = f.squads[0], b = f.squads[1];
    // Presentation-only fixture: the two identities project to exactly the same point.
    const root = window as unknown as { eliminatedSquad?: number };
    const update = client.update.bind(client);
    client.update = patch => update(patch.frame ? { ...patch, frame: { ...patch.frame,
      squads: patch.frame.squads.map(q => ({ ...q, anchorX: a.anchorX, anchorY: a.anchorY, alive: root.eliminatedSquad === q.id ? 0 : q.alive })),
    } } : patch);
    client.update({ frame: f });
    view.rig.centerOn(a.anchorX, a.anchorY);
    view.rig.span = view.rig.targetSpan = 55;
    input.select([b.id]);
    return [a.id, b.id];
  });
  await expect(page.locator(`.squad-label[data-squad-id="${ids[1]}"]`)).toBeVisible();
  await expect(page.locator(`.squad-label[data-squad-id="${ids[0]}"]`)).toBeHidden();
  await page.evaluate(id => {
    const { client } = (window as unknown as { vazante: { client: FixtureClient } }).vazante;
    (window as unknown as { eliminatedSquad: number }).eliminatedSquad = id;
    client.update({ frame: client.state.frame! });
  }, ids[1]);
  await expect(page.locator(`.squad-label[data-squad-id="${ids[1]}"]`)).toHaveCount(0);
  await expect(page.locator(`.squad-label[data-squad-id="${ids[0]}"]`)).toBeVisible();
  expect(await stateHash(page)).toBe(hash);
  expect(errors).toEqual([]);
});
