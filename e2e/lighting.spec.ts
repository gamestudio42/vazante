import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

test('pixel composite preserves dark tones, a black floor and day/night atmosphere', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  const root = `/@fs${process.cwd()}`;
  const result = await page.evaluate(async ({ postUrl, paletteUrl }) => {
    const { PixelPost } = await import(postUrl);
    const { PALETTE } = await import(paletteUrl);
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    const renderer = view.renderer;
    const gl = renderer.getContext();
    // Exercise the real GPU shader with known linear-light inputs, independently of weather,
    // world generation, UI overlays or the clock. Use the game's Three.js objects/context.
    const scene = view.scene.clone(false);
    scene.fog = null;
    const background = view.scene.fog!.color.clone();
    scene.background = background;
    const post = new PixelPost();
    post.setSize(64, 64);
    renderer.setSize(64, 64, false);
    const pixel = new Uint8Array(4);
    const sample = (x: number, y: number) => {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return (pixel[0] + pixel[1] + pixel[2]) / 3;
    };
    const tones: number[] = [];
    for (const linear of [0, 0.004, 0.012, 0.025, 0.08]) {
      background.setRGB(linear, linear, linear);
      post.render(renderer, scene, view.rig.ortho);
      tones.push(sample(32, 32));
    }
    const camera = view.rig.persp.clone();
    camera.aspect = 1;
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.fog = view.scene.fog!.clone();
    post.render(renderer, scene, view.rig.ortho);
    const mapBackground = sample(32, 32);
    const skies: number[][] = [];
    const skyNoise: number[] = [];
    for (const night of [false, true]) {
      background.set(night ? PALETTE.skyNight : PALETTE.sky);
      scene.fog.color.set(night ? PALETTE.fogNight : PALETTE.fog);
      post.render(renderer, scene, camera);
      skies.push([sample(32, 32), sample(32, 58)]);
      const row = [30, 31, 32, 33].map(x => sample(x, 20));
      skyNoise.push(Math.max(...row) - Math.min(...row));
    }
    post.target.dispose();
    view.resize(window.innerWidth, window.innerHeight);
    view.render(performance.now(), 0);
    return { tones, skies, mapBackground, skyNoise };
  }, { postUrl: `${root}/packages/view3d/src/post.ts`, paletteUrl: `${root}/packages/view3d/src/palette.ts` });

  expect(result.mapBackground).toBe(0);
  for (const noise of result.skyNoise) expect(noise).toBeLessThan(2);
  expect(result.tones[0]).toBe(0);
  expect(result.tones[1]).toBeGreaterThan(8);
  expect(result.tones[2]).toBeGreaterThan(20);
  for (let i = 1; i < result.tones.length; i++) expect(result.tones[i]).toBeGreaterThan(result.tones[i - 1] + 3);
  const [day, night] = result.skies;
  expect(day[0]).toBeGreaterThan(day[1] + 10);
  expect(night[0]).toBeGreaterThan(night[1] + 3);
  expect(day[0]).toBeGreaterThan(night[0] * 1.5);
  expect(night[1]).toBeGreaterThan(8);
  expect(await stateHash(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('lighting and camera presentation leave the paused world unchanged', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  const soldiers = (await frame(page)).soldiers.length;
  // Only the renderer's input frame gets a different clock for these visual fixtures.
  // The authoritative worker stays paused, including during the direct-camera preview.
  for (const hour of [12, 21]) {
    for (const camera of ['tactical', 'strategic', 'direct'] as const) {
      const capture = await page.evaluate(({ hour, camera }) => {
        const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
        const snapshot = view.latest!;
        const base = view.map.sites.find(s => s.kind === 'base')!;
        const x = (base.x0 + base.x1 + 1) * view.map.cellSize / 2;
        const y = (base.y0 + base.y1 + 1) * view.map.cellSize / 2;
        view.rig.direct = camera === 'direct' ? { x, y, yaw: -Math.PI / 2 } : null;
        view.rig.span = view.rig.targetSpan = camera === 'strategic' ? view.rig.maxSpan : 110;
        view.rig.centerOn(x, y);
        view.pushFrame({ ...snapshot, day: { lengthS: 1200, startHour: hour - snapshot.tick / 12000 * 24 } }, performance.now());
        view.render(performance.now(), 0);
        // Read in the same task: the next input frame restores the player's camera.
        return {
          hour: view.hours,
          perspective: view.rig.active === view.rig.persp,
          png: view.renderer.domElement.toDataURL('image/png').split(',')[1],
        };
      }, { hour, camera });
      expect(capture.hour).toBeCloseTo(hour, 1);
      expect(capture.perspective).toBe(camera === 'direct');
      await testInfo.attach(`${camera}-${hour}h`, { body: Buffer.from(capture.png, 'base64'), contentType: 'image/png' });
      expect(await stateHash(page)).toBe(before);
      expect((await frame(page)).soldiers.length).toBe(soldiers);
    }
  }
  expect(errors).toEqual([]);
});

test('close direct camera hides only the controlled model and restores it when clear', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  const result = await page.evaluate(() => {
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    const snapshot = view.latest!;
    const internals = view as unknown as { soldierCrowd: { mesh: { count: number } } | null; soldiers: { count: number } };
    const count = () => internals.soldierCrowd?.mesh.count ?? internals.soldiers.count;
    view.pushFrame({ ...snapshot, directSoldier: snapshot.soldiers[0] }, performance.now());
    view.rig.setBuildings([{ id: 1, x0: 0, y0: 0, x1: 1, y1: 4, height: 30 }], 4);
    view.rig.direct = { x: 9, y: 40, yaw: 0 };
    view.render(performance.now(), 1);
    const clear = count();
    view.rig.direct.y = 10;
    view.render(performance.now(), 0.016);
    const close = count();
    const hidden = view.rig.hideControlledSoldier;
    view.rig.direct.y = 40;
    view.render(performance.now(), 2);
    const restored = count();
    view.rig.setBuildings(view.map.buildings, view.map.cellSize);
    view.pushFrame(snapshot, performance.now());
    return { clear, close, restored, hidden };
  });
  expect(result.hidden).toBe(true);
  expect(result.clear).toBeGreaterThan(0);
  expect(result.close).toBe(result.clear - 1);
  expect(result.restored).toBe(result.clear);
  expect(await stateHash(page)).toBe(before);
  expect(errors).toEqual([]);
});
