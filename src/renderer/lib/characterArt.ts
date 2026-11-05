import type { CharacterId, OutfitId, WeaponId } from '../../shared/contracts/progression.ts';
import emberIdleBack from '../assets/characters/ember/idle-back.png';
import emberIdleFront from '../assets/characters/ember/idle-front.png';
import blackPinkIdleBack from '../assets/characters/ember/outfits/black-pink/idle-back.png';
import blackPinkIdleFront from '../assets/characters/ember/outfits/black-pink/idle-front.png';
import blackPinkPortrait from '../assets/characters/ember/outfits/black-pink/portrait.png';
import blackPinkVictoryBack from '../assets/characters/ember/outfits/black-pink/victory-back.png';
import blackPinkVictoryFront from '../assets/characters/ember/outfits/black-pink/victory-front.png';
import blueIdleBack from '../assets/characters/ember/outfits/blue/idle-back.png';
import blueIdleFront from '../assets/characters/ember/outfits/blue/idle-front.png';
import bluePortrait from '../assets/characters/ember/outfits/blue/portrait.png';
import blueVictoryBack from '../assets/characters/ember/outfits/blue/victory-back.png';
import blueVictoryFront from '../assets/characters/ember/outfits/blue/victory-front.png';
import greenIdleBack from '../assets/characters/ember/outfits/green/idle-back.png';
import greenIdleFront from '../assets/characters/ember/outfits/green/idle-front.png';
import greenPortrait from '../assets/characters/ember/outfits/green/portrait.png';
import greenVictoryBack from '../assets/characters/ember/outfits/green/victory-back.png';
import greenVictoryFront from '../assets/characters/ember/outfits/green/victory-front.png';
import whiteVioletIdleBack from '../assets/characters/ember/outfits/white-violet/idle-back.png';
import whiteVioletIdleFront from '../assets/characters/ember/outfits/white-violet/idle-front.png';
import whiteVioletPortrait from '../assets/characters/ember/outfits/white-violet/portrait.png';
import whiteVioletVictoryBack from '../assets/characters/ember/outfits/white-violet/victory-back.png';
import whiteVioletVictoryFront from '../assets/characters/ember/outfits/white-violet/victory-front.png';
import emberPortrait from '../assets/characters/ember/portrait.png';
import crystalScepterIdle from '../assets/characters/ember/scepters/crystal-scepter/idle.png';
import crystalScepterVictory from '../assets/characters/ember/scepters/crystal-scepter/victory.png';
import icyScepterIdle from '../assets/characters/ember/scepters/icy-scepter/idle.png';
import icyScepterVictory from '../assets/characters/ember/scepters/icy-scepter/victory.png';
import magentaScepterIdle from '../assets/characters/ember/scepters/magenta-scepter/idle.png';
import magentaScepterVictory from '../assets/characters/ember/scepters/magenta-scepter/victory.png';
import verdantScepterIdle from '../assets/characters/ember/scepters/verdant-scepter/idle.png';
import verdantScepterVictory from '../assets/characters/ember/scepters/verdant-scepter/victory.png';
import violetScepterIdle from '../assets/characters/ember/scepters/violet-scepter/idle.png';
import violetScepterVictory from '../assets/characters/ember/scepters/violet-scepter/victory.png';
import emberVictoryBack from '../assets/characters/ember/victory-back.png';
import emberVictoryFront from '../assets/characters/ember/victory-front.png';
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
import tealIdleBack from '../assets/characters/shadow/teal/idle-back.png';
import tealIdleFront from '../assets/characters/shadow/teal/idle-front.png';
import tealVictoryBack from '../assets/characters/shadow/teal/victory-back.png';
import tealVictoryFront from '../assets/characters/shadow/teal/victory-front.png';
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
  portrait: (outfit: OutfitId) => string;
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
  teal: {
    idleBack: tealIdleBack,
    idleFront: tealIdleFront,
    victoryBack: tealVictoryBack,
    victoryFront: tealVictoryFront,
  },
};

const shadowWeapons: Partial<Record<WeaponId, { idle: string; victory: string }>> = {
  dagger: { idle: daggerIdle, victory: daggerVictory },
  'void-crescent': { idle: voidCrescentIdle, victory: voidCrescentVictory },
  sunfang: { idle: sunfangIdle, victory: sunfangVictory },
  stormfork: { idle: stormforkIdle, victory: stormforkVictory },
  'icy-dagger': { idle: icyDaggerIdle, victory: icyDaggerVictory },
};

const emberBodies: Partial<Record<OutfitId, Body>> = {
  default: {
    idleBack: emberIdleBack,
    idleFront: emberIdleFront,
    victoryBack: emberVictoryBack,
    victoryFront: emberVictoryFront,
  },
  blue: {
    idleBack: blueIdleBack,
    idleFront: blueIdleFront,
    victoryBack: blueVictoryBack,
    victoryFront: blueVictoryFront,
  },
  green: {
    idleBack: greenIdleBack,
    idleFront: greenIdleFront,
    victoryBack: greenVictoryBack,
    victoryFront: greenVictoryFront,
  },
  'black-pink': {
    idleBack: blackPinkIdleBack,
    idleFront: blackPinkIdleFront,
    victoryBack: blackPinkVictoryBack,
    victoryFront: blackPinkVictoryFront,
  },
  'white-violet': {
    idleBack: whiteVioletIdleBack,
    idleFront: whiteVioletIdleFront,
    victoryBack: whiteVioletVictoryBack,
    victoryFront: whiteVioletVictoryFront,
  },
};

const emberPortraits: Partial<Record<OutfitId, string>> = {
  blue: bluePortrait,
  green: greenPortrait,
  'black-pink': blackPinkPortrait,
  'white-violet': whiteVioletPortrait,
};

const emberScepters: Partial<Record<WeaponId, { idle: string; victory: string }>> = {
  'crystal-scepter': { idle: crystalScepterIdle, victory: crystalScepterVictory },
  'icy-scepter': { idle: icyScepterIdle, victory: icyScepterVictory },
  'verdant-scepter': { idle: verdantScepterIdle, victory: verdantScepterVictory },
  'magenta-scepter': { idle: magentaScepterIdle, victory: magentaScepterVictory },
  'violet-scepter': { idle: violetScepterIdle, victory: violetScepterVictory },
};

// Characters without art yet show their initial instead. Outfits without sheets show the default.
export const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  shadow: {
    ...animations,
    portrait: () => shadowPortrait,
    layers: (outfit, weapon) =>
      holding(
        shadowBodies[outfit] ?? shadowBodies.default!,
        shadowWeapons[weapon] ?? shadowWeapons.dagger!,
      ),
  },
  ember: {
    ...animations,
    portrait: (outfit) => emberPortraits[outfit] ?? emberPortrait,
    layers: (outfit, weapon) =>
      holding(
        emberBodies[outfit] ?? emberBodies.default!,
        emberScepters[weapon] ?? emberScepters['crystal-scepter']!,
      ),
  },
};
