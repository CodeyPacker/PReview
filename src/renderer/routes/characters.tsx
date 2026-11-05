import { createFileRoute } from '@tanstack/react-router';
import { Shirt, Sword } from 'lucide-react';
import { useState } from 'react';
import {
  CHARACTER_XP_PER_LEVEL,
  outfits,
  weapons,
  type CharacterId,
} from '../../shared/contracts/progression.ts';
import { PageHeader } from '../app/PageHeader.tsx';
import { Button } from '../components/Button/Button.tsx';
import { CharacterCard } from '../components/CharacterCard/CharacterCard.tsx';
import { ChoiceTile } from '../components/ChoiceTile/ChoiceTile.tsx';
import { LevelTrack } from '../components/LevelTrack/LevelTrack.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { ProgressBar } from '../components/ProgressBar/ProgressBar.tsx';
import { Sprite } from '../components/Sprite/Sprite.tsx';
import { Tag } from '../components/Tag/Tag.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { useProgression } from '../hooks/useProgression.ts';
import { characterArt } from '../lib/characterArt.ts';
import styles from './characters.module.css';

export const Route = createFileRoute('/characters')({ component: CharactersPage });

const xp = (value: number) => value.toLocaleString('en-US');

type PreviewAnimation = 'idle' | 'victory';
const previewAnimations = [
  { value: 'idle', label: 'Idle' },
  { value: 'victory', label: 'Victory' },
] satisfies { value: PreviewAnimation; label: string }[];

function CharactersPage() {
  const { progression, setActiveCharacter, setOutfit, setWeapon } = useProgression();
  const [viewedId, setViewedId] = useState<CharacterId>();
  const [preview, setPreview] = useState<PreviewAnimation>('idle');
  const data = progression.data;
  if (!data) return null;

  const viewed =
    data.characters.find((character) => character.id === (viewedId ?? data.activeCharacter)) ??
    data.characters[0]!;
  const isCompanion = viewed.id === data.activeCharacter;
  const art = viewed.unlocked ? characterArt[viewed.id] : undefined;
  const levelReached = (unlockLevel: number) => viewed.unlocked && viewed.level >= unlockLevel;
  // Every reward in level order. The dagger is left out, since every character starts with it.
  const rewards = [
    ...outfits.map((outfit) => ({ ...outfit, kind: 'Outfit', icon: <Shirt aria-hidden /> })),
    ...weapons
      .filter((weapon) => weapon.unlockLevel > 1)
      .map((weapon) => ({ ...weapon, kind: 'Weapon', icon: <Sword aria-hidden /> })),
  ].sort((a, b) => a.unlockLevel - b.unlockLevel);
  // The newest unlocked reward is the current step on the track.
  const reached = rewards.filter((reward) => levelReached(reward.unlockLevel)).at(-1);
  const next = rewards.find((reward) => !levelReached(reward.unlockLevel));
  // XP a character needs in all to reach a level.
  const xpForLevel = (level: number) => (level - 1) * CHARACTER_XP_PER_LEVEL;

  return (
    <div className={styles.page}>
      <PageHeader title="Characters" description="Collect and customize your review companions." />
      <div className={styles.top}>
        <Panel title="All Characters">
          <div className={styles.roster}>
            {data.characters.map((character) => (
              <CharacterCard
                key={character.id}
                name={character.name}
                image={character.unlocked ? characterArt[character.id]?.portrait : undefined}
                selected={character.id === viewed.id}
                onClick={() => {
                  setViewedId(character.id);
                  setPreview('idle');
                }}
                {...(character.unlocked
                  ? { level: character.level }
                  : {
                      locked: true,
                      unlockHint: `Unlocks at Account Level ${character.unlockLevel}`,
                    })}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <div className={styles.detail}>
            <div className={styles.detailHead}>
              <h2 className="title-1">{viewed.unlocked ? viewed.name : '???'}</h2>
              {viewed.unlocked && (
                <Tag tone="accent" size="sm">
                  Lv. {viewed.level}
                </Tag>
              )}
            </div>
            {viewed.unlocked ? (
              <>
                <ProgressBar
                  className={styles.levelBar}
                  value={viewed.levelXp}
                  max={viewed.nextLevelXp}
                  aria-label={`${viewed.name} level progress`}
                  valueLabel={`${xp(viewed.levelXp)} / ${xp(viewed.nextLevelXp)} XP`}
                />
                <p className={styles.text}>{viewed.title}</p>
              </>
            ) : (
              <p className={styles.text}>Unlocks at Account Level {viewed.unlockLevel}.</p>
            )}
            {art ? (
              <>
                <div className={styles.art}>
                  <Sprite
                    className={styles.sprite}
                    animation={art[preview]}
                    layers={art.layers[preview]}
                    label={viewed.name}
                    onFinished={() => setPreview('idle')}
                  />
                </div>
                <ToggleGroup
                  aria-label="Animation"
                  size="sm"
                  options={previewAnimations}
                  value={preview}
                  onValueChange={setPreview}
                />
              </>
            ) : (
              <div className={styles.art} aria-hidden>
                {viewed.unlocked ? viewed.name.charAt(0) : '?'}
              </div>
            )}
            <Button
              variant="primary"
              disabled={!viewed.unlocked || isCompanion}
              loading={setActiveCharacter.isPending}
              onClick={() => setActiveCharacter.mutate(viewed.id)}
            >
              {isCompanion ? 'Your Companion' : 'Set as Companion'}
            </Button>
            <p className={styles.note}>New reviews earn XP for your companion.</p>
          </div>
        </Panel>

        <div className={styles.gear}>
          <Panel title="Outfit">
            <div className={styles.outfits} role="group" aria-label="Outfit">
              {outfits.map((outfit) => {
                const unlocked = levelReached(outfit.unlockLevel);
                return (
                  <ChoiceTile
                    key={outfit.id}
                    label={outfit.name}
                    selected={viewed.unlocked && viewed.outfit === outfit.id}
                    locked={!unlocked}
                    disabled={setOutfit.isPending}
                    {...(!unlocked && {
                      'aria-label': `${outfit.name}, unlocks at level ${outfit.unlockLevel}`,
                    })}
                    onClick={() => {
                      if (unlocked)
                        setOutfit.mutate({ characterId: viewed.id, outfitId: outfit.id });
                    }}
                  >
                    <Shirt aria-hidden />
                  </ChoiceTile>
                );
              })}
            </div>
          </Panel>
          <Panel title="Weapon">
            <div className={styles.outfits} role="group" aria-label="Weapon">
              {weapons.map((weapon) => {
                const unlocked = levelReached(weapon.unlockLevel);
                return (
                  <ChoiceTile
                    key={weapon.id}
                    label={weapon.name}
                    selected={viewed.unlocked && viewed.weapon === weapon.id}
                    locked={!unlocked}
                    disabled={setWeapon.isPending}
                    {...(!unlocked && {
                      'aria-label': `${weapon.name}, unlocks at level ${weapon.unlockLevel}`,
                    })}
                    onClick={() => {
                      if (unlocked)
                        setWeapon.mutate({ characterId: viewed.id, weaponId: weapon.id });
                    }}
                  >
                    <Sword aria-hidden />
                  </ChoiceTile>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <div className={styles.bottom}>
        <Panel title="Progression & Unlocks">
          <LevelTrack
            steps={rewards.map((reward) => ({
              level: reward.unlockLevel,
              label: reward.kind,
              sublabel: reward.name,
              icon: reward.icon,
              state:
                reward.id === reached?.id
                  ? 'current'
                  : levelReached(reward.unlockLevel)
                    ? 'done'
                    : 'locked',
            }))}
          />
        </Panel>
        <Panel title="Next Unlock">
          {!viewed.unlocked ? (
            <p className={styles.text}>Unlock this character to earn rewards.</p>
          ) : next ? (
            <div className={styles.next}>
              <span className="headline">
                {next.name} {next.kind}
              </span>
              <Tag tone="accent" size="sm">
                Level {next.unlockLevel}
              </Tag>
              <ProgressBar
                className={styles.nextBar}
                value={viewed.xp}
                max={xpForLevel(next.unlockLevel)}
                aria-label={`Progress to the ${next.name} ${next.kind.toLowerCase()}`}
                valueLabel={`${xp(viewed.xp)} / ${xp(xpForLevel(next.unlockLevel))} XP`}
              />
            </div>
          ) : (
            <p className={styles.text}>Every reward is unlocked.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
