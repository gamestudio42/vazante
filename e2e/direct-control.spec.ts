import { test, expect } from '@playwright/test';
import { startGame, frame, watchErrors } from './helpers.ts';

test('TAB captures safely, looks vertically, releases fire on blur and exits', async ({ page }, info) => {
  await page.route('**/gc.zgo.at/count.js', r => r.fulfill({contentType:'application/javascript',body:'',headers:{'Cross-Origin-Resource-Policy':'cross-origin'}}));
  const errors=watchErrors(page);
  await startGame(page);
  await page.bringToFront();
  await page.getByText('Alfa').first().click();
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).not.toBeNull();
  // Chromium may decline keyboard-initiated capture when the window first receives focus.
  // Exercise the supported click-to-capture fallback without treating that click as fire.
  await expect(async () => {
    if (!await page.evaluate(() => !!document.pointerLockElement)) await page.mouse.click(640,360);
    expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  }).toPass({ timeout: 10000 });
  const state=()=>page.evaluate(()=>{
    const g=(window as unknown as {vazante:{input:{directYaw:number;directPitch:number;fire:boolean};view:{rig:{persp:{quaternion:{x:number;y:number;z:number;w:number}}}}}}).vazante;
    return {yaw:g.input.directYaw,pitch:g.input.directPitch,fire:g.input.fire};
  });
  const initial=await state();
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementY:80})));
  await expect.poll(async()=> (await state()).pitch).toBeGreaterThan(initial.pitch);
  expect((await state()).yaw).toBe(initial.yaw);
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:60})));
  await expect.poll(async()=> (await state()).yaw).toBeGreaterThan(initial.yaw);
  const cross=await page.locator('.crosshair').boundingBox();
  expect(cross!.x+cross!.width/2).toBeCloseTo(640,0);
  expect(cross!.y+cross!.height/2).toBeCloseTo(360,0);
  await expect(page.locator('.direct-aim-status')).toBeVisible();
  expect((await frame(page)).directAim).toBeDefined();
  await page.mouse.down(); await expect.poll(async()=> (await state()).fire).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect.poll(async()=> (await state()).fire).toBe(false);
  await page.mouse.up();
  await page.evaluate(()=>document.exitPointerLock());
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
  await page.mouse.click(640,360);
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  expect((await state()).fire).toBe(false);
  await page.screenshot({path:info.outputPath('direct-control.png')});
  await page.keyboard.press('Tab');
  await expect.poll(async()=> (await frame(page)).directSoldier).toBeNull();
  await expect(page.locator('.crosshair')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('direct HUD renders worker target, obstruction, reload and hit feedback', async ({page}) => {
  const errors=watchErrors(page);
  await startGame(page);
  await page.getByText('Alfa').first().click(); await page.keyboard.press('Tab');
  await expect.poll(async()=> (await frame(page)).directSoldier).not.toBeNull();
  // Override presentation snapshots only; the worker's combat tests check target correctness.
  await page.evaluate(()=>{
    const g=(window as unknown as {vazante:{client:{update:(patch:Record<string,unknown>)=>void};view:{latest:import('@vazante/shared').Frame}}}).vazante;
    const root=window as unknown as {aimFixture?:string};
    const update=g.client.update.bind(g.client);
    g.client.update=(patch)=>{
      if(patch.frame && root.aimFixture) {
        const f=patch.frame as import('@vazante/shared').Frame;
        const at=Array.from(f.soldiers).findIndex((v,i)=>i%13===0 && v===f.directSoldier);
        const x=f.soldiers[at+2]+f.soldiers[at+4]*10, y=f.soldiers[at+3]+f.soldiers[at+5]*10;
        patch={...patch,frame:{...f,directAim:{x,y,target:root.aimFixture==='target'?0:null,blocked:root.aimFixture==='blocked',reloading:root.aimFixture==='reloading'},
          events:root.aimFixture==='hit'?[{type:'shot',tick:f.tick,source:f.directSoldier,value:1}]:[]}};
      }
      update(patch);
    };
  });
  for(const status of ['clear','target','blocked','reloading','hit']) {
    await page.evaluate(status=>{(window as unknown as {aimFixture:string}).aimFixture=status;},status);
    await expect(page.locator('.direct-aim-status')).toHaveClass(new RegExp(status));
  }
  expect(errors).toEqual([]);
});
