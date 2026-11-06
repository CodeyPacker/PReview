import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar/index.ts';
import { Sprite } from '../components/Sprite/Sprite.tsx';
import { useAgentTasks } from '../hooks/useAgentTasks.ts';
import { useProgression } from '../hooks/useProgression.ts';
import { characterArt } from '../lib/characterArt.ts';
import { onCompanionCheer } from '../lib/companionCheer.ts';
import styles from './Companion.module.css';

// Celebrates what the reviewer did: XP, which also covers level-ups, achievements and merges,
// a finished agent, and a saved finding or review. Nothing moves with reduced motion, so the
// companion stays idle then.
function useCheering(xp: number | undefined, completedAgents: string | undefined) {
  const [cheering, setCheering] = useState(false);
  const queryClient = useQueryClient();
  const seen = useRef({ xp, completedAgents });

  useEffect(() => {
    const cheer = () => {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setCheering(true);
    };
    return onCompanionCheer(cheer);
  }, []);

  useEffect(() => {
    const previous = seen.current;
    seen.current = { xp, completedAgents };
    const moreXp = previous.xp !== undefined && xp !== undefined && xp > previous.xp;
    // Only a new one counts. Deleting review data or rerunning a task also changes the list.
    const earlier = previous.completedAgents?.split(',');
    const agentFinished =
      earlier !== undefined &&
      completedAgents !== undefined &&
      completedAgents.split(',').some((id) => id !== '' && !earlier.includes(id));
    // A finished agent may have earned XP in the main process.
    if (agentFinished) void queryClient.invalidateQueries({ queryKey: ['progression'] });
    if ((moreXp || agentFinished) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCheering(true);
    }
  }, [xp, completedAgents, queryClient]);

  return { cheering, stopCheering: () => setCheering(false) };
}

// The active character in the sidebar, with its level. The sidebar hides it in Zen Mode.
export function Companion() {
  const { data: progression } = useProgression().progression;
  const { data: tasks } = useAgentTasks();
  const completedAgents = tasks
    ?.filter((task) => task.status === 'completed')
    .map((task) => task.id)
    .join();
  const { cheering, stopCheering } = useCheering(progression?.account.xp, completedAgents);

  const character = progression?.characters.find(({ id }) => id === progression.activeCharacter);
  const art = character && characterArt[character.id];
  const layers = character && art?.layers(character.outfit, character.weapon);

  // The first cheer shouldn't show an empty frame while its sheets load.
  useEffect(() => {
    for (const layer of layers?.victory ?? []) new Image().src = layer;
  }, [layers]);

  if (!character) return null;
  return (
    <section className={styles.companion} aria-label="Your companion">
      {art && layers && (
        <Sprite
          className={styles.sprite}
          animation={cheering ? art.victory : art.idle}
          layers={cheering ? layers.victory : layers.idle}
          label={character.name}
          onFinished={stopCheering}
        />
      )}
      <div className={styles.text}>
        <span className={styles.name}>{character.name}</span>
        <ProgressBar
          value={character.levelXp}
          max={character.nextLevelXp}
          aria-label="Companion level progress"
          label={`Level ${character.level}`}
          valueLabel={`${character.levelXp.toLocaleString('en-US')} / ${character.nextLevelXp.toLocaleString('en-US')} XP`}
        />
      </div>
    </section>
  );
}
