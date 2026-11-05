import type { CharacterId } from '../../shared/contracts/progression.ts';
import emberIdle from '../assets/characters/ember/idle.png';
import emberPortrait from '../assets/characters/ember/portrait.png';
import emberVictory from '../assets/characters/ember/victory.png';
import shadowIdle from '../assets/characters/shadow/idle.png';
import shadowPortrait from '../assets/characters/shadow/portrait.png';
import shadowVictory from '../assets/characters/shadow/victory.png';
import type { SpriteAnimation } from '../components/Sprite/index.ts';

export interface CharacterArt {
  portrait: string;
  idle: SpriteAnimation;
  victory: SpriteAnimation;
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// Every character's sheets share the same frame size and timing.
const art = (portrait: string, idle: string, victory: string): CharacterArt => ({
  portrait,
  idle: {
    name: 'idle',
    src: idle,
    frameWidth: 512,
    frameHeight: 512,
    columns: 8,
    frames: range(8),
    frameDurationMs: 120,
    loop: true,
  },
  victory: {
    name: 'victory',
    src: victory,
    frameWidth: 512,
    frameHeight: 512,
    columns: 12,
    frames: range(12),
    frameDurationMs: 80,
    loop: false,
  },
});

// Characters without art yet show their initial instead. Outfits have no sheets in the app yet,
// so every outfit shows the default art.
export const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  shadow: art(shadowPortrait, shadowIdle, shadowVictory),
  ember: art(emberPortrait, emberIdle, emberVictory),
};
