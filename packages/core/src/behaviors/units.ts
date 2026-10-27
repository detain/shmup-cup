/**
 * # behaviors/units — the unit of every behaviour tunable
 *
 * **Responsibility.** What each behaviour tunable means (plan_resolution.md R1-03, owner decision
 * O5): content `params` — an enemy's, a boss phase's, a weapon's — are `s.record(s.num({ unit:
 * 'param' }))`, a number whose unit depends on the behaviour it tunes. {@link BEHAVIOR_PARAM_UNITS}
 * gives it per behaviour id and tunable name, for the unit coverage test and
 * `scripts/content/rescale.mjs` (the ×1.5 port of R2-02). The behaviours themselves
 * (`behaviors/index.ts`, `weapons/index.ts` `WEAPON_BEHAVIOR_PARAMS`) are left as they are: a test
 * holds this table's names to their tunables, exactly.
 *
 * **Implements.** shmup_feat.md §11 / §13 (the behaviours' tunables), §22 (data-driven content);
 * plan_resolution.md R1-03, §2.6.
 *
 * **Public API.** {@link BEHAVIOR_PARAM_UNITS}.
 *
 * @remarks
 * Tooling only, like `data/units`: nothing the game runs imports this module, so a production
 * bundle drops it.
 *
 * @module
 */
import type { NumberUnit } from '../data/units.js';

/**
 * The unit of a tunable name wherever it means the same (most of them): times end in `Ticks`,
 * speeds in `Speed`, and so on. A behaviour that uses a name otherwise overrides it in
 * {@link units}.
 */
const COMMON: Readonly<Record<string, NumberUnit>> = Object.freeze({
  // Speeds and accelerations.
  speed: 'px-per-tick',
  bulletSpeed: 'px-per-tick',
  leaveSpeed: 'px-per-tick',
  chargeSpeed: 'px-per-tick',
  splitSpeed: 'px-per-tick',
  launchSpeed: 'px-per-tick',
  retractSpeed: 'px-per-tick',
  ringSpeed: 'px-per-tick',
  spiralSpeed: 'px-per-tick',
  trackSpeed: 'px-per-tick',
  slideSpeed: 'px-per-tick',
  minUp: 'px-per-tick',
  maxUp: 'px-per-tick',
  up: 'px-per-tick',
  vx: 'px-per-tick',
  maxFall: 'px-per-tick',
  strength: 'px-per-tick',
  grabPull: 'px-per-tick',
  pullStrength: 'px-per-tick',
  grabStrength: 'px-per-tick',
  growth: 'px-per-tick',
  lobSpeed: 'px-per-tick',
  gravity: 'px-per-tick2',
  // World lengths: radii, reaches, margins, half sizes, laser widths and lengths.
  radius: 'world-px',
  grabRadius: 'world-px',
  pullRadius: 'world-px',
  blastRadius: 'world-px',
  seekRadius: 'world-px',
  forkRange: 'world-px',
  beamWidth: 'world-px',
  reach: 'world-px',
  trigger: 'world-px',
  margin: 'world-px',
  lineX: 'world-px',
  laserWidth: 'world-px',
  maxLength: 'world-px',
  startSize: 'world-px',
  maxSize: 'world-px',
  stompShake: 'world-px',
  hw: 'world-px',
  hh: 'world-px',
  // Relative offsets.
  amp: 'rel-px',
  gap: 'rel-px',
  gape: 'rel-px',
  rx: 'rel-px',
  ry: 'rel-px',
  ox: 'rel-px',
  oy: 'rel-px',
  // Screen columns and rows the behaviour moves to (`moveTo`, a waypoint, an orbit's centre);
  // `laserLength` is one playfield wide (plan §2.6).
  x: 'screen-x',
  meetX: 'screen-x',
  turnX: 'screen-x',
  ramX: 'screen-x',
  frontX: 'screen-x',
  backX: 'screen-x',
  minX: 'screen-x',
  maxX: 'screen-x',
  cx: 'screen-x',
  laserLength: 'screen-x',
  cy: 'screen-y',
  minY: 'screen-y',
  maxY: 'screen-y',
  // A waypoint's row is a playfield y, like a spawn's.
  y: 'world-y',
  lineY: 'world-y',
  // Angles and turn rates (binary units).
  angle: 'angle',
  phase: 'angle',
  memberPhase: 'angle',
  heading: 'angle',
  spread: 'angle',
  turnRate: 'angle',
  coneAngle: 'angle',
  aimStep: 'angle',
  spin: 'angle',
  curl: 'angle',
  wave: 'angle',
  sway: 'angle',
  spiralStep: 'angle',
  // Times.
  period: 'ticks',
  interval: 'ticks',
  hold: 'ticks',
  windup: 'ticks',
  windUp: 'ticks',
  telegraph: 'ticks',
  active: 'ticks',
  fuse: 'ticks',
  aimTicks: 'ticks',
  fireTicks: 'ticks',
  walkTicks: 'ticks',
  stopTicks: 'ticks',
  enterTicks: 'ticks',
  ringTicks: 'ticks',
  restTicks: 'ticks',
  lineUpTicks: 'ticks',
  scatterTicks: 'ticks',
  extendTicks: 'ticks',
  launchTicks: 'ticks',
  homeTicks: 'ticks',
  chaseTicks: 'ticks',
  firstTicks: 'ticks',
  laserTicks: 'ticks',
  openTicks: 'ticks',
  closedTicks: 'ticks',
  firstLaser: 'ticks',
  waveTicks: 'ticks',
  ramTicks: 'ticks',
  returnTicks: 'ticks',
  stepTicks: 'ticks',
  reverseTicks: 'ticks',
  sweepTicks: 'ticks',
  guardTicks: 'ticks',
  gunTicks: 'ticks',
  spiralTicks: 'ticks',
  swayTicks: 'ticks',
  pullTicks: 'ticks',
  grabTicks: 'ticks',
  pauseTicks: 'ticks',
  blastTicks: 'ticks',
  hitCooldownTicks: 'ticks',
  lifeTicks: 'ticks',
  forkTicks: 'ticks',
  delayTicks: 'ticks',
  beamTicks: 'ticks',
  // Counts.
  count: 'count',
  max: 'count',
  ring: 'count',
  ringCount: 'count',
  ways: 'count',
  waves: 'count',
  links: 'count',
  minis: 'count',
  spiral: 'count',
  pellets: 'count',
  drones: 'count',
  forks: 'count',
  beacons: 'count',
  frames: 'count',
  // Factors.
  aspect: 'ratio',
  track: 'ratio',
  // Indices and switches.
  variant: 'index',
  frame: 'index',
  turn: 'index',
  passArmour: 'index',
  flip: 'index',
});

/**
 * One behaviour's units.
 *
 * @param names - Its tunables, space-separated.
 * @param overrides - Units of the names it uses otherwise than {@link COMMON}.
 * @returns Tunable name → unit (frozen).
 * @throws Error when a name has no unit — a new tunable must be classified here.
 */
function units(
  names: string,
  overrides: Readonly<Record<string, NumberUnit>> = {},
): Readonly<Record<string, NumberUnit>> {
  const out: Record<string, NumberUnit> = {};
  for (const name of names.split(' ')) {
    const unit = Object.prototype.hasOwnProperty.call(overrides, name)
      ? overrides[name]
      : Object.prototype.hasOwnProperty.call(COMMON, name)
        ? COMMON[name]
        : undefined;
    if (unit === undefined) throw new Error('behaviour tunable "' + name + '" has no unit');
    out[name] = unit;
  }
  return Object.freeze(out);
}

/**
 * The unit of every behaviour tunable (owner decision O5), by behaviour id (an enemy's or a boss
 * phase's `script`, a weapon's `behavior`) and tunable name — what the `param` unit of a content
 * `params` entry stands for.
 *
 * @remarks
 * Its names equal each behaviour's tunables exactly (`packages/core/test/behaviors/
 * behavior-param-units.test.ts` compares them with `DEFAULT_BEHAVIOR_DEFS`,
 * `DEFAULT_BOSS_BEHAVIOR_DEFS` and `WEAPON_BEHAVIOR_PARAMS`), so a new tunable fails that test
 * until it is classified here. Units that differ from a name's usual one: `captain.circler`'s
 * `speed` and `boss.steed`'s `bobSpeed` turn an orbit (binary units per tick), `volcano.lob`'s
 * `spread` is a sideways speed, and `captain.crab`'s `turn` is how far its rings turn.
 *
 * @example
 * ```ts
 * BEHAVIOR_PARAM_UNITS['drifter.sine']?.amp; // 'rel-px'
 * ```
 */
export const BEHAVIOR_PARAM_UNITS: Readonly<Record<string, Readonly<Record<string, NumberUnit>>>> =
  Object.freeze({
    // Enemies (core/behaviors DEFAULT_BEHAVIOR_DEFS).
    'drifter.sine': units('speed amp period phase memberPhase'),
    'fan.loop': units('speed'),
    'carrier.straight': units('speed'),
    'turret.floor': units('aimTicks fireTicks bulletSpeed'),
    'walker.floor': units('speed walkTicks stopTicks bulletSpeed spread'),
    'hatch.spawner': units('interval max'),
    'rammer.aimed': units('enterTicks windup speed'),
    'orbiter.loop': units('speed x y hold leaveSpeed ringTicks ringCount bulletSpeed'),
    'pattern.loop': units('restTicks heading'),
    'hunter.option': units('variant lineUpTicks speed windup chargeSpeed lineX lineY'),
    'cube.pincer': units('speed meetX gap leaveSpeed'),
    'rock.fall': units('trigger gravity maxFall'),
    'bubble.split': units('speed amp period count splitSpeed spread scatterTicks'),
    'volcano.lob': units('interval count minUp maxUp spread gravity maxFall', {
      spread: 'px-per-tick',
    }),
    'field.suction': units('radius strength'),
    'tentacle.grab': units(
      'links reach speed turnRate extendTicks grabRadius grabPull retractSpeed restTicks',
    ),
    'cube.stack': units('speed margin'),
    'rocket.homing': units('launchTicks launchSpeed speed turnRate homeTicks'),
    'worm.burst': units('trigger vx up gravity maxFall'),
    'rear.swoop': units('speed turnX hold ways spread bulletSpeed leaveSpeed'),
    'cell.chase': units('speed enterTicks turnRate chaseTicks scatterTicks'),
    'emitter.laser': units('firstTicks laserTicks heading laserLength laserWidth telegraph active'),
    'mine.burst': units('speed amp period trigger fuse ring bulletSpeed'),
    // Bosses (core/behaviors DEFAULT_BOSS_BEHAVIOR_DEFS).
    'boss.hover': units(
      'trackSpeed margin fireTicks bulletSpeed ways spread openTicks closedTicks',
    ),
    'boss.lanes': units(
      'trackSpeed margin laserTicks laserLength laserWidth telegraph active fireTicks bulletSpeed ' +
        'ways spread',
    ),
    'boss.bulwark': units(
      'trackSpeed margin laserTicks firstLaser laserLength laserWidth telegraph active fireTicks ' +
        'bulletSpeed ways spread',
    ),
    'boss.raid': units('fireTicks bulletSpeed ways spread aimStep'),
    'captain.ram': units(
      'waves waveTicks ways spread bulletSpeed ramTicks ramX returnTicks restTicks',
    ),
    'captain.launcher': units(
      'trackSpeed margin launchTicks count fireTicks bulletSpeed ways spread',
    ),
    'captain.circler': units('cx cy rx ry speed fireTicks bulletSpeed ring', { speed: 'angle' }),
    'captain.crab': units('stepTicks minX maxX minY maxY ringTicks ring bulletSpeed turn', {
      turn: 'angle',
    }),
    'boss.maw': units(
      'trackSpeed margin closedTicks openTicks fireTicks bulletSpeed ways spread ring ringSpeed ' +
        'launchTicks count gape',
    ),
    'boss.widow': units(
      'stepTicks minX maxX minY maxY fireTicks bulletSpeed ways spread launchTicks count ' +
        'laserTicks laserLength laserWidth telegraph active',
    ),
    'boss.bastion': units(
      'trackSpeed margin spin reverseTicks laserTicks firstLaser laserLength laserWidth telegraph ' +
        'active fireTicks ways spread bulletSpeed ring ringTicks ringSpeed',
    ),
    'boss.steed': units(
      'cx cy rx ry bobSpeed closedTicks openTicks launchTicks minis fireTicks ways spread ' +
        'bulletSpeed ring ringSpeed gape',
      { bobSpeed: 'angle' },
    ),
    'boss.squid': units(
      'trackSpeed margin curl sweepTicks guardTicks openTicks fireTicks ways spread bulletSpeed ' +
        'gunTicks ring ringSpeed launchTicks count',
    ),
    'boss.facet': units(
      'trackSpeed margin wave waveTicks fireTicks ways spread bulletSpeed ring ringTicks ringSpeed ' +
        'laserTicks laserLength laserWidth telegraph active',
    ),
    'boss.sovereign': units(
      'trackSpeed margin spin reverseTicks laserTicks firstLaser laserLength laserWidth telegraph ' +
        'active fireTicks ways spread bulletSpeed ring ringTicks ringSpeed launchTicks count ' +
        'spiral spiralTicks spiralStep spiralSpeed',
    ),
    'boss.ark': units(
      'fireTicks bulletSpeed ways spread aimStep launchTicks count ring ringTicks ringSpeed',
    ),
    'boss.angler': units(
      'trackSpeed margin closedTicks openTicks gape fireTicks ways spread bulletSpeed ring ' +
        'ringSpeed sway swayTicks gunTicks launchTicks count',
    ),
    'boss.suction': units(
      'trackSpeed margin pullTicks restTicks pullRadius pullStrength fireTicks ways spread ' +
        'bulletSpeed openTicks',
    ),
    'boss.grabber': units(
      'trackSpeed margin windUp grabTicks grabRadius grabStrength restTicks fireTicks ways spread ' +
        'bulletSpeed',
    ),
    'boss.walker': units(
      'frontX backX stepTicks pauseTicks fireTicks ways spread bulletSpeed stompShake',
    ),
    // Weapons (core/weapons WEAPON_BEHAVIOR_PARAMS).
    'shot.straight': units('ox oy hw hh'),
    'shot.double': units('angle ox oy hw hh'),
    'laser.beam': units('maxLength hitCooldownTicks ox oy hh'),
    'missile.groundSlide': units('slideSpeed angle ox oy hw hh frames'),
    'missile.spreadBomb': units(
      'angle gravity ox oy hw hh blastRadius blastTicks hitCooldownTicks frames',
    ),
    'missile.twoWay': units('angle ox oy hw hh'),
    'missile.torpedo': units('slideSpeed angle ox oy hw hh frames'),
    'shot.tailGun': units('angle ox oy hw hh'),
    'shot.vertical': units('angle ox oy hw hh'),
    'shot.freeWay': units('angle ox oy hw hh'),
    'laser.ripple': units('startSize maxSize growth aspect ox oy frames'),
    'laser.cyclone': units('maxLength hitCooldownTicks ox oy hh frames'),
    'laser.twin': units('maxLength gap ox oy hh'),
    'direct.bolt': units('ox oy hw hh frame turn hitCooldownTicks passArmour'),
    'direct.bomb': units(
      'gravity ox oy hw hh blastRadius blastTicks hitCooldownTicks frames frame',
    ),
    'missile.control': units('track ox oy hw hh frames'),
    'missile.upper': units('slideSpeed angle ox oy hw hh frames flip'),
    'missile.smallSpread': units(
      'angle gravity ox oy hw hh blastRadius blastTicks hitCooldownTicks frames flip',
    ),
    'missile.hawkWind': units('slideSpeed angle ox oy hw hh frames'),
    'missile.twoWayBack': units('angle ox oy hw hh flip'),
    'shot.backDouble': units('angle ox oy hw hh flip'),
    'shot.spreadGun': units('angle ox oy hw hh'),
    // W15-A: the five new main weapon types.
    'shot.flak': units('pellets coneAngle lifeTicks ox oy hw hh'),
    'shot.rail': units('maxLength hitCooldownTicks passArmour ox oy hh frames'),
    'shot.drone': units('drones turnRate seekRadius gap turn ox oy hw hh frames'),
    'laser.chain': units('forks forkRange forkTicks ox oy hw hh frames'),
    'missile.beacon': units(
      'beacons gap lobSpeed gravity delayTicks beamTicks beamWidth hitCooldownTicks ox oy hh frames',
    ),
  });
