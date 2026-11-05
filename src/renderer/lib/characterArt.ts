import type { CharacterId } from '../../shared/contracts/progression.ts';
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

// Characters without art yet show their initial instead. Outfits have no sheets in the app yet,
// so every outfit shows the default art.
export const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  shadow: {
    portrait: shadowPortrait,
    idle: {
      name: 'idle',
      src: shadowIdle,
      frameWidth: 512,
      frameHeight: 512,
      columns: 8,
      frames: range(8),
      frameDurationMs: 120,
      loop: true,
    },
    victory: {
      name: 'victory',
      src: shadowVictory,
      frameWidth: 512,
      frameHeight: 512,
      columns: 12,
      frames: range(12),
      frameDurationMs: 80,
      loop: false,
    },
  },
};
