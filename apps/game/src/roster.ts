import { SOLDIER_STRIDE, SQUADS, SoldierCondition, VETERANCY, rankForXp, type CrewSeat, type CrewView, type SquadKind } from '@vazante/shared';

/**
 * The campaign roster: the soldiers who carry over from one mission to the next. Survivors gain
 * experience and rank; the dead go to the memorial and their slot gets a recruit.
 *
 * Slots are keyed by squad kind and how many squads of that kind came before in the mission
 * (`slice:0`, `slice:1`, `marines:0`), so a mission that fields a second line squad always
 * draws the same people for it. Pure functions; storage is at the bottom.
 */

export const ROSTER_VERSION = 1;
/** Names kept in the memorial. */
export const MAX_FALLEN = 100;

export interface Trooper {
  rid: number;
  name: string;
  xp: number;
  kills: number;
  missions: number;
}

export type Fate = 'alive' | 'killed' | 'turned' | 'infected';

export interface Fallen {
  rid: number;
  name: string;
  rank: number;
  kills: number;
  missions: number;
  mission: string;
  fate: Exclude<Fate, 'alive'>;
  /** Epoch ms. */
  at: number;
}

export interface Roster {
  version: number;
  nextRid: number;
  /** Slot key → soldiers by member slot; null is an empty slot waiting for a recruit. */
  units: Record<string, (Trooper | null)[]>;
  /** Newest first. */
  fallen: Fallen[];
}

export interface ReportRow {
  rid: number;
  name: string;
  rankBefore: number;
  rankAfter: number;
  /** Kills in this mission. */
  kills: number;
  fate: Fate;
}

export function emptyRoster(): Roster {
  return { version: ROSTER_VERSION, nextRid: 1, units: {}, fallen: [] };
}

export function parseRoster(raw: string | null): Roster {
  if (!raw) return emptyRoster();
  try {
    const v = JSON.parse(raw) as Partial<Roster>;
    if (v.version !== ROSTER_VERSION || typeof v.nextRid !== 'number' || !v.units || !Array.isArray(v.fallen)) return emptyRoster();
    return { version: ROSTER_VERSION, nextRid: v.nextRid, units: v.units, fallen: v.fallen };
  } catch {
    return emptyRoster();
  }
}

/** Surnames for recruits: the task force is drawn from all over the country. */
export const SURNAMES: readonly string[] = [
  'Almeida', 'Andrade', 'Araújo', 'Assis', 'Barbosa', 'Barros', 'Batista', 'Bezerra', 'Borges', 'Braga',
  'Brandão', 'Cabral', 'Caldas', 'Campos', 'Cardoso', 'Carvalho', 'Castro', 'Cavalcanti', 'Coelho', 'Correia',
  'Costa', 'Cruz', 'Cunha', 'Dias', 'Duarte', 'Esteves', 'Farias', 'Feitosa', 'Fernandes', 'Ferraz',
  'Figueiredo', 'Fonseca', 'Freitas', 'Galvão', 'Gomes', 'Guerra', 'Ikeda', 'Jesus', 'Kowalski', 'Lacerda',
  'Leal', 'Leite', 'Lima', 'Lopes', 'Macedo', 'Machado', 'Maia', 'Marinho', 'Martins', 'Matos',
  'Medeiros', 'Melo', 'Mendes', 'Miranda', 'Monteiro', 'Moraes', 'Moura', 'Nakamura', 'Nascimento', 'Neves',
  'Nogueira', 'Nunes', 'Oliveira', 'Pacheco', 'Paiva', 'Peixoto', 'Pereira', 'Pinheiro', 'Pinto', 'Prado',
  'Queiroz', 'Ramos', 'Rangel', 'Rezende', 'Ribeiro', 'Rocha', 'Sales', 'Sampaio', 'Santana', 'Santos',
  'Saraiva', 'Silva', 'Siqueira', 'Soares', 'Souza', 'Tavares', 'Teixeira', 'Toledo', 'Vasconcelos', 'Vieira',
  'Xavier', 'Yamamoto', 'Zanetti',
];

/** A surname nobody living or in the memorial carries yet; repeats the fallen's, then anyone's, once all are taken. */
export function pickName(roster: Roster, rand: () => number): string {
  const living = new Set(Object.values(roster.units).flatMap((u) => u.filter((x): x is Trooper => x !== null).map((x) => x.name)));
  const fallen = new Set(roster.fallen.map((x) => x.name));
  const fresh = SURNAMES.filter((n) => !living.has(n) && !fallen.has(n));
  const free = fresh.length > 0 ? fresh : SURNAMES.filter((n) => !living.has(n));
  const pool = free.length > 0 ? free : SURNAMES;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Slot keys for a mission's squads, in order. */
export function slotKeys(squads: readonly { kind: SquadKind }[]): string[] {
  const seen = new Map<SquadKind, number>();
  return squads.map((q) => {
    const n = seen.get(q.kind) ?? 0;
    seen.set(q.kind, n + 1);
    return `${q.kind}:${n}`;
  });
}

/** Fill the mission's slots (recruits with `recruitXp` where empty) and return the seats for the simulation. */
export function crewFor(roster: Roster, squads: readonly { kind: SquadKind }[], rand: () => number, recruitXp = 0): { roster: Roster; crew: CrewSeat[][] } {
  let r: Roster = { ...roster, units: { ...roster.units } };
  const crew = slotKeys(squads).map((key, i) => {
    const size = SQUADS[squads[i].kind].weapons.length;
    const unit = [...(r.units[key] ?? [])].slice(0, size);
    for (let k = 0; k < size; k++) {
      if (unit[k]) continue;
      unit[k] = { rid: r.nextRid, name: pickName(r, rand), xp: recruitXp, kills: 0, missions: 0 };
      r = { ...r, nextRid: r.nextRid + 1, units: { ...r.units, [key]: unit } };
    }
    r = { ...r, units: { ...r.units, [key]: unit } };
    return unit.map((x) => ({ rid: x!.rid, rank: rankForXp(x!.xp) }));
  });
  return { roster: r, crew };
}

/** Every roster soldier in the game, with how the mission left them (read from a frame). */
export function crewResults(crew: readonly CrewView[], soldiers: Float32Array): { rid: number; kills: number; condition: SoldierCondition }[] {
  const condition = new Map<number, SoldierCondition>();
  for (let o = 0; o < soldiers.length; o += SOLDIER_STRIDE) condition.set(soldiers[o], soldiers[o + 8] as SoldierCondition);
  return crew.map((c) => ({ rid: c.rid, kills: c.kills, condition: condition.get(c.id) ?? SoldierCondition.Dead }));
}

function fateOf(c: SoldierCondition): Fate {
  return c === SoldierCondition.Dead ? 'killed' : c === SoldierCondition.Turned ? 'turned' : c === SoldierCondition.Bitten ? 'infected' : 'alive';
}

/**
 * Apply a finished mission. Survivors gain experience; the dead, the turned and the bitten (nobody
 * brings a bite home) leave the roster for the memorial. Soldiers no longer on the roster (a save
 * from before they fell) change nothing, so loading an old save never brings anyone back.
 */
export function settle(
  roster: Roster,
  mission: string,
  won: boolean,
  results: readonly { rid: number; kills: number; condition: SoldierCondition }[],
  now: number,
): { roster: Roster; report: ReportRow[] } {
  const units: Roster['units'] = Object.fromEntries(Object.entries(roster.units).map(([k, u]) => [k, [...u]]));
  const fallen: Fallen[] = [];
  const report: ReportRow[] = [];
  for (const res of results) {
    for (const unit of Object.values(units)) {
      const k = unit.findIndex((x) => x?.rid === res.rid);
      if (k < 0) continue;
      const t = unit[k]!;
      const fate = fateOf(res.condition);
      const rankBefore = rankForXp(t.xp);
      if (fate === 'alive') {
        const xp = t.xp + res.kills * VETERANCY.killXp + (won ? VETERANCY.wonXp : VETERANCY.lostXp);
        unit[k] = { ...t, xp, kills: t.kills + res.kills, missions: t.missions + 1 };
        report.push({ rid: t.rid, name: t.name, rankBefore, rankAfter: rankForXp(xp), kills: res.kills, fate });
      } else {
        unit[k] = null;
        fallen.push({ rid: t.rid, name: t.name, rank: rankBefore, kills: t.kills + res.kills, missions: t.missions + 1, mission, fate, at: now });
        report.push({ rid: t.rid, name: t.name, rankBefore, rankAfter: rankBefore, kills: res.kills, fate });
      }
      break;
    }
  }
  return { roster: { ...roster, units, fallen: [...fallen, ...roster.fallen].slice(0, MAX_FALLEN) }, report };
}

/** Every living soldier on the roster. */
export function living(roster: Roster): Trooper[] {
  return Object.values(roster.units).flatMap((u) => u.filter((x): x is Trooper => x !== null));
}

/** Soldier name by roster id, for the HUD. */
export function namesByRid(roster: Roster): Map<number, Trooper> {
  const m = new Map<number, Trooper>();
  for (const unit of Object.values(roster.units)) for (const x of unit) if (x) m.set(x.rid, x);
  return m;
}

const KEY = 'vazante.roster';

export function loadRoster(): Roster {
  try {
    return parseRoster(localStorage.getItem(KEY));
  } catch {
    return emptyRoster();
  }
}

export function saveRoster(r: Roster): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // Storage refused (private window): the roster lasts for this page.
  }
}
