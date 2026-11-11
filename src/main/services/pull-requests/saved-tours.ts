import type {
  AskSavedTourInput,
  SavedTourInput,
  StartTourInput,
} from '../../../shared/contracts/tours.ts';
import { TourStore } from './tour-store.ts';
import type { Tours } from './tours.ts';

// Provider work finishes before SQLite transactions begin, so a slow answer never locks the DB.
export class SavedTours {
  private running = 0;
  private generations = new Map<string, Promise<unknown>>();
  get busy() {
    return this.running > 0;
  }

  constructor(
    readonly store: TourStore,
    private readonly engine: Pick<Tours, 'start' | 'ask' | 'snapshot'>,
  ) {}

  async start(input: StartTourInput) {
    const identity = this.store.identity(input.pullRequestId);
    const started = Date.now();
    const key = JSON.stringify([
      identity.repository,
      identity.providerId,
      input.headSha,
      input.mergeBase,
      input.provider ?? 'claude',
    ]);
    const previous = this.generations.get(key);
    this.running++;
    const generation = (async () => {
      // Concurrent depth requests must observe the first saved outline before generating text.
      if (previous) await previous.catch(() => undefined);
      const plan = await this.engine.start(input, this.store.outline(input));
      return this.store.create(input, identity, plan, Math.max(0, Date.now() - started));
    })();
    this.generations.set(key, generation);
    try {
      return await generation;
    } finally {
      this.running--;
      if (this.generations.get(key) === generation) this.generations.delete(key);
    }
  }

  async resume(input: SavedTourInput) {
    await this.engine.snapshot(input);
    const saved = this.store.require(input);
    return this.store.get(saved.id);
  }

  async ask(input: AskSavedTourInput) {
    const saved = this.store.require(input);
    const stop = saved.plan.stops[input.stopIndex];
    if (!stop) throw new Error('This stop is not in the saved tour.');
    const messageId = this.store.beginMessage(
      saved.id,
      input.stopIndex,
      input.kind,
      input.question,
    );
    const started = Date.now();
    this.running++;
    try {
      const answer = await this.engine.ask({
        ...input,
        provider: saved.provider,
        depth: saved.depth,
        stop,
        history: saved.messages
          .filter(
            (message) => message.stopIndex === input.stopIndex && message.status === 'completed',
          )
          .slice(-6)
          .map((message) => ({
            question: message.question,
            answer: (message.answer ?? '').slice(0, 12000),
          })),
      });
      this.store.finishMessage(messageId, answer, null, Math.max(0, Date.now() - started));
      return this.store.get(saved.id);
    } catch (error) {
      this.store.finishMessage(
        messageId,
        null,
        error instanceof Error ? error.message : String(error),
        Math.max(0, Date.now() - started),
      );
      throw error;
    } finally {
      this.running--;
    }
  }
}
