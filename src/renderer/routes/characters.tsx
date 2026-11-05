import { createFileRoute } from '@tanstack/react-router';
import { Shirt } from 'lucide-react';
import { useState } from 'react';
import {
  CHARACTER_XP_PER_LEVEL,
  outfits,
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
  const { progression, setActiveCharacter, setOutfit } = useProgression();
  const [viewedId, setViewedId] = useState<CharacterId>();
  const [preview, setPreview] = useState<PreviewAnimation>('idle');
  const data = progression.data;
  if (!data) return null;

  const viewed =
    data.characters.find((character) => character.id === (viewedId ?? data.activeCharacter)) ??
    data.characters[0]!;
  const isCompanion = viewed.id === data.activeCharacter;
  const art = viewed.unlocked ? characterArt[viewed.id] : undefined;
  const outfitUnlocked = (unlockLevel: number) => viewed.unlocked && viewed.level >= unlockLevel;
  // The newest unlocked outfit is the current step on the track.
  const reached = outfits.filter((outfit) => outfitUnlocked(outfit.unlockLevel)).at(-1);
  const next = outfits.find((outfit) => !outfitUnlocked(outfit.unlockLevel));
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

        <Panel title="Outfit">
          <div className={styles.outfits} role="group" aria-label="Outfit">
            {outfits.map((outfit) => {
              const unlocked = outfitUnlocked(outfit.unlockLevel);
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
                    if (unlocked) setOutfit.mutate({ characterId: viewed.id, outfitId: outfit.id });
                  }}
                >
                  <Shirt aria-hidden />
                </ChoiceTile>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className={styles.bottom}>
        <Panel title="Progression & Unlocks">
          <LevelTrack
            steps={outfits.map((outfit) => ({
              level: outfit.unlockLevel,
              label: 'Outfit',
              sublabel: outfit.name,
              icon: <Shirt aria-hidden />,
              state:
                outfit.id === reached?.id
                  ? 'current'
                  : outfitUnlocked(outfit.unlockLevel)
                    ? 'done'
                    : 'locked',
            }))}
          />
        </Panel>
        <Panel title="Next Unlock">
          {!viewed.unlocked ? (
            <p className={styles.text}>Unlock this character to earn outfits.</p>
          ) : next ? (
            <div className={styles.next}>
              <span className="headline">{next.name} Outfit</span>
              <Tag tone="accent" size="sm">
                Level {next.unlockLevel}
              </Tag>
              <ProgressBar
                className={styles.nextBar}
                value={viewed.xp}
                max={xpForLevel(next.unlockLevel)}
                aria-label={`Progress to the ${next.name} outfit`}
                valueLabel={`${xp(viewed.xp)} / ${xp(xpForLevel(next.unlockLevel))} XP`}
              />
            </div>
          ) : (
            <p className={styles.text}>Every outfit is unlocked.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
