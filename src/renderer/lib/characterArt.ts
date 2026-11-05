import type { CharacterId, WeaponId } from '../../shared/contracts/progression.ts';
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
import shadowIdle from '../assets/characters/shadow/idle.png';
import shadowPortrait from '../assets/characters/shadow/portrait.png';
import shadowVictory from '../assets/characters/shadow/victory.png';
import type { SpriteAnimation } from '../components/Sprite/index.ts';

// The sheets to stack for each animation, back to front.
type Layers = Record<'idle' | 'victory', string[]>;

export interface CharacterArt {
  portrait: string;
  idle: SpriteAnimation;
  victory: SpriteAnimation;
  layers: Layers;
  // Weapons drawn apart from the character. The starting weapon is part of `layers`.
  weaponLayers?: Partial<Record<WeaponId, Layers>>;
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

// Stacks a staff between Ember's back and front layers.
const emberStaff = (idle: string, victory: string): Layers => ({
  idle: [emberIdleBack, idle, emberIdleFront],
  victory: [emberVictoryBack, victory, emberVictoryFront],
});

// Characters without art yet show their initial instead. Outfits have no sheets in the app yet,
// so every outfit shows the default art.
export const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  shadow: {
    ...animations,
    portrait: shadowPortrait,
    layers: { idle: [shadowIdle], victory: [shadowVictory] },
  },
  ember: {
    ...animations,
    portrait: emberPortrait,
    layers: { idle: [emberIdle], victory: [emberVictory] },
    weaponLayers: {
      emberheart: emberStaff(emberheartIdle, emberheartVictory),
      'phoenix-crown': emberStaff(phoenixCrownIdle, phoenixCrownVictory),
      'solar-sovereign': emberStaff(solarSovereignIdle, solarSovereignVictory),
    },
  },
};

// The layers of a character holding a weapon.
export function layersFor(art: CharacterArt, weapon: WeaponId): Layers {
  return art.weaponLayers?.[weapon] ?? art.layers;
}
