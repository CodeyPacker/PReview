import type { CharacterId, OutfitId, WeaponId } from '../../shared/contracts/progression.ts';
import emberIdleBack from '../assets/characters/ember/idle-back.png';
import emberIdleFront from '../assets/characters/ember/idle-front.png';
import emberIdle from '../assets/characters/ember/idle.png';
import emberPortrait from '../assets/characters/ember/portrait.png';
import emberheartIdle from '../assets/characters/ember/staffs/emberheart/idle.png';
import emberheartVictory from '../assets/characters/ember/staffs/emberheart/victory.png';
import phoenixCrownIdle from '../assets/characters/ember/staffs/phoenix-crown/idle.png';
import phoenixCrownVictory from '../assets/characters/ember/staffs/phoenix-crown/victory.png';
import solarSovereignIdle from '../assets/characters/ember/staffs/solar-sovereign/idle.png';
import solarSovereignVictory from '../assets/characters/ember/staffs/solar-sovereign/victory.png';
import emberVictoryBack from '../assets/characters/ember/victory-back.png';
import emberVictoryFront from '../assets/characters/ember/victory-front.png';
import emberVictory from '../assets/characters/ember/victory.png';
import crimsonIdleBack from '../assets/characters/shadow/crimson/idle-back.png';
import crimsonIdleFront from '../assets/characters/shadow/crimson/idle-front.png';
import crimsonVictoryBack from '../assets/characters/shadow/crimson/victory-back.png';
import crimsonVictoryFront from '../assets/characters/shadow/crimson/victory-front.png';
import defaultIdleBack from '../assets/characters/shadow/default/idle-back.png';
import defaultIdleFront from '../assets/characters/shadow/default/idle-front.png';
import defaultVictoryBack from '../assets/characters/shadow/default/victory-back.png';
import defaultVictoryFront from '../assets/characters/shadow/default/victory-front.png';
import shadowPortrait from '../assets/characters/shadow/portrait.png';
import sageIdleBack from '../assets/characters/shadow/sage/idle-back.png';
import sageIdleFront from '../assets/characters/shadow/sage/idle-front.png';
import sageVictoryBack from '../assets/characters/shadow/sage/victory-back.png';
import sageVictoryFront from '../assets/characters/shadow/sage/victory-front.png';
import daggerIdle from '../assets/characters/shadow/weapons/dagger/idle.png';
import daggerVictory from '../assets/characters/shadow/weapons/dagger/victory.png';
import icyDaggerIdle from '../assets/characters/shadow/weapons/icy-dagger/idle.png';
import icyDaggerVictory from '../assets/characters/shadow/weapons/icy-dagger/victory.png';
import stormforkIdle from '../assets/characters/shadow/weapons/stormfork/idle.png';
import stormforkVictory from '../assets/characters/shadow/weapons/stormfork/victory.png';
import sunfangIdle from '../assets/characters/shadow/weapons/sunfang/idle.png';
import sunfangVictory from '../assets/characters/shadow/weapons/sunfang/victory.png';
import voidCrescentIdle from '../assets/characters/shadow/weapons/void-crescent/idle.png';
import voidCrescentVictory from '../assets/characters/shadow/weapons/void-crescent/victory.png';
import type { SpriteAnimation } from '../components/Sprite/index.ts';

// The sheets to stack for each animation, back to front.
type Layers = Record<'idle' | 'victory', string[]>;

export interface CharacterArt {
  portrait: string;
  idle: SpriteAnimation;
  victory: SpriteAnimation;
  layers: (outfit: OutfitId, weapon: WeaponId) => Layers;
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// Every character's sheets share the same frame size and timing.
const animations = {
  idle: {
    name: 'idle',
    frameWidth: 512,
    frameHeight: 512,
    columns: 8,
    frames: range(8),
    frameDurationMs: 120,
    loop: true,
  },
  victory: {
    name: 'victory',
    frameWidth: 512,
    frameHeight: 512,
    columns: 12,
    frames: range(12),
    frameDurationMs: 80,
    loop: false,
  },
} satisfies Pick<CharacterArt, 'idle' | 'victory'>;

// A character drawn without a weapon, in the parts that go behind and in front of it.
interface Body {
  idleBack: string;
  idleFront: string;
  victoryBack: string;
  victoryFront: string;
}

const holding = (body: Body, weapon: { idle: string; victory: string }): Layers => ({
  idle: [body.idleBack, weapon.idle, body.idleFront],
  victory: [body.victoryBack, weapon.victory, body.victoryFront],
});

const shadowBodies: Partial<Record<OutfitId, Body>> = {
  default: {
    idleBack: defaultIdleBack,
    idleFront: defaultIdleFront,
    victoryBack: defaultVictoryBack,
    victoryFront: defaultVictoryFront,
  },
  crimson: {
    idleBack: crimsonIdleBack,
    idleFront: crimsonIdleFront,
    victoryBack: crimsonVictoryBack,
    victoryFront: crimsonVictoryFront,
  },
  sage: {
    idleBack: sageIdleBack,
    idleFront: sageIdleFront,
    victoryBack: sageVictoryBack,
    victoryFront: sageVictoryFront,
  },
};

const shadowWeapons: Partial<Record<WeaponId, { idle: string; victory: string }>> = {
  dagger: { idle: daggerIdle, victory: daggerVictory },
  'void-crescent': { idle: voidCrescentIdle, victory: voidCrescentVictory },
  sunfang: { idle: sunfangIdle, victory: sunfangVictory },
  stormfork: { idle: stormforkIdle, victory: stormforkVictory },
  'icy-dagger': { idle: icyDaggerIdle, victory: icyDaggerVictory },
};

const emberBody: Body = {
  idleBack: emberIdleBack,
  idleFront: emberIdleFront,
  victoryBack: emberVictoryBack,
  victoryFront: emberVictoryFront,
};

const emberStaffs: Partial<Record<WeaponId, { idle: string; victory: string }>> = {
  emberheart: { idle: emberheartIdle, victory: emberheartVictory },
  'phoenix-crown': { idle: phoenixCrownIdle, victory: phoenixCrownVictory },
  'solar-sovereign': { idle: solarSovereignIdle, victory: solarSovereignVictory },
};

// Characters without art yet show their initial instead. Outfits without sheets show the default.
export const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  shadow: {
    ...animations,
    portrait: shadowPortrait,
    layers: (outfit, weapon) =>
      holding(
        shadowBodies[outfit] ?? shadowBodies.default!,
        shadowWeapons[weapon] ?? shadowWeapons.dagger!,
      ),
  },
  ember: {
    ...animations,
    portrait: emberPortrait,
    // The Crystal Staff is part of Ember's full sheets.
    layers: (_outfit, weapon) => {
      const staff = emberStaffs[weapon];
      return staff ? holding(emberBody, staff) : { idle: [emberIdle], victory: [emberVictory] };
    },
  },
};
