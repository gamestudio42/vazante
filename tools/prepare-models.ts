// Turns the CC0 character packs in assets-src/ into the lean .glb files the game loads:
// unused weapons and animations are dropped. Run with `pnpm models` after adding a pack.
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';
import { mkdirSync } from 'node:fs';

interface Job {
  src: string;
  out: string;
  meshes: string[];
  clips: string[];
}

const SRC = 'assets-src/toon-shooter';
const OUT = 'apps/game/public/models';

const JOBS: Job[] = [
  {
    src: `${SRC}/Character_Soldier.gltf`,
    out: `${OUT}/soldier.glb`,
    meshes: ['Body', 'Head', 'ShoulderPad.L', 'ShoulderPad.R', 'AK'],
    clips: ['Idle', 'Walk', 'Run_Gun', 'Idle_Shoot', 'Walk_Shoot', 'Run_Shoot', 'Death', 'HitReact', 'Duck'],
  },
  {
    src: `${SRC}/Character_Enemy.gltf`,
    out: `${OUT}/infected.glb`,
    meshes: ['Character_Enemy', 'Character_Enemy_Head'],
    clips: ['Idle', 'Walk', 'Run', 'Punch', 'Death', 'HitReact'],
  },
];

/** Static props: converted whole. */
const PROPS = ['Debris_BrokenCar', 'SackTrench', 'Barrier_Large', 'Container_Long', 'Tank'];

const io = new NodeIO();
mkdirSync(OUT, { recursive: true });
for (const job of JOBS) {
  const doc = await io.read(job.src);
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    if (node.getMesh() && !job.meshes.includes(node.getName())) node.dispose();
  }
  for (const anim of root.listAnimations()) if (!job.clips.includes(anim.getName())) anim.dispose();
  await doc.transform(prune(), dedup());
  await io.write(job.out, doc);
  const kept = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  console.log(`${job.out}: meshes ${kept.join(', ')}; clips ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
}

mkdirSync(`${OUT}/props`, { recursive: true });
for (const name of PROPS) {
  const doc = await io.read(`${SRC}/env/${name}.gltf`);
  await doc.transform(prune(), dedup());
  await io.write(`${OUT}/props/${name}.glb`, doc);
  console.log(`${OUT}/props/${name}.glb`);
}
