import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { cx } from '../lib/cx.ts';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from '../components/Button/Button.tsx';
import { Markdown } from '../components/Markdown/Markdown.tsx';
import type { useTour } from '../hooks/useTour.ts';
import { useTourShortcuts } from '../hooks/useTourShortcuts.ts';
import type { TourDepth, TourProvider } from '../../shared/contracts/tours.ts';
import styles from './Tour.module.css';

type TourState = ReturnType<typeof useTour>;

const depths: { value: TourDepth; label: string; description: string }[] = [
  {
    value: 'overview',
    label: 'Overview',
    description: 'Short, plain-language explanations of what changed and why it matters.',
  },
  {
    value: 'normal',
    label: 'Normal',
    description:
      'Clear explanations of how the changes work, with the important details and risks.',
  },
  {
    value: 'deep',
    label: 'Deep',
    description:
      'Detailed, technical explanations of implementation, edge cases, tradeoffs and tests.',
  },
];

export function TourPlanning({
  state,
  onRetry,
  onContinue,
}: {
  state: TourState;
  onRetry: () => void;
  onContinue: (depth: TourDepth, provider: TourProvider, resumeId?: number) => void;
}) {
  const { depth, setDepth, provider, setProvider } = state;
  const saved = state.saved.find((saved) => saved.provider === provider && saved.depth === depth);
  const loading = state.preparing || state.planning;
  return (
    <section className={styles.planning} aria-label="Preparing AI tour" aria-busy={loading}>
      {loading ? (
        <>
          <LoaderCircle className={styles.spinner} aria-hidden />
          <h2>
            {state.preparing
              ? 'Preparing your pull request'
              : state.resuming
                ? 'Restoring your tour'
                : `${state.providerName} is planning your tour`}
          </h2>
          <p role="status">
            {state.preparing
              ? 'Checking the changes before you choose your tour.'
              : 'Reading the changes and finding the order to walk through them.'}
          </p>
        </>
      ) : state.choosing ? (
        <form
          className={styles.setup}
          onSubmit={(event) => {
            event.preventDefault();
            onContinue(depth, provider, saved?.id);
          }}
        >
          <h2 id="tour-depth-title">How deep should we go?</h2>
          <p>
            Every level covers the same files and stops. Choose how simple or technical the
            explanations should be.
          </p>
          <fieldset className={styles.providers}>
            <legend className={styles.legend}>Tour provider</legend>
            {(['claude', 'codex'] as const).map((value) => (
              <label className={styles.depth} key={value}>
                <input
                  type="radio"
                  name="tour-provider"
                  value={value}
                  checked={provider === value}
                  onChange={() => setProvider(value)}
                  aria-label={value === 'claude' ? 'Claude' : 'Codex'}
                />
                <strong>{value === 'claude' ? 'Claude' : 'Codex'}</strong>
              </label>
            ))}
          </fieldset>
          <p className={styles.providerHint}>Uses your signed-in Claude Code or Codex CLI.</p>
          <fieldset className={styles.depths}>
            <legend className={styles.legend}>Tour depth</legend>
            {depths.map((option) => (
              <label className={styles.depth} key={option.value}>
                <input
                  type="radio"
                  name="tour-depth"
                  value={option.value}
                  checked={depth === option.value}
                  onChange={() => setDepth(option.value)}
                  aria-label={option.label}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className={styles.description}>{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {saved && (
            <p role="status">
              Saved tour · Stop {saved.currentStop + 1} of {saved.totalStops} · {saved.visitedStops}{' '}
              visited
            </p>
          )}
          <Button type="submit" variant="primary">
            {saved ? (saved.completedAt ? 'Reopen tour' : 'Resume tour') : 'Continue'}
          </Button>
          {saved && (
            <Button type="button" onClick={() => onContinue(depth, provider)}>
              Generate new tour
            </Button>
          )}
        </form>
      ) : (
        <>
          <h2>Could not prepare the tour</h2>
          <p role="alert">{state.error}</p>
          <Button onClick={onRetry}>Try again</Button>
        </>
      )}
      <Button
        variant="plain"
        onClick={state.close}
        aria-keyshortcuts="Escape"
        title="Return to review (Esc)"
      >
        Return to review
      </Button>
    </section>
  );
}

export function TourGuide({
  state,
  onStep,
  atStop,
  layout,
  onLayoutChange,
}: {
  state: TourState;
  onStep: (index: number) => void;
  atStop: boolean;
  layout: 'split' | 'stacked';
  onLayoutChange: (layout: 'split' | 'stacked') => void;
}) {
  const [question, setQuestion] = useState('');
  const askInput = useRef<HTMLInputElement>(null);
  const tour = state.tour;
  const stop = tour?.stops[state.index];
  useTourShortcuts(Boolean(tour && stop), state.asking, {
    deeper: () => {
      void state.ask('Explain this more deeply.', 'deeper');
    },
    technical: () => {
      void state.ask('Explain the technical details and tradeoffs.', 'technical');
    },
    ask: () => askInput.current?.focus(),
  });
  if (!tour || !stop) return null;
  return (
    <section
      className={cx(styles.guide, layout === 'split' && styles.split)}
      aria-label="AI guided tour"
    >
      <div className={styles.controls}>
        <span className={styles.progress}>
          Stop {state.index + 1} of {tour.stops.length} · {stop.group || tour.title}
        </span>
        <ToggleGroup
          aria-label="Tour layout"
          size="sm"
          value={layout}
          onValueChange={onLayoutChange}
          options={[
            { value: 'split', label: 'Split' },
            { value: 'stacked', label: 'Stacked' },
          ]}
        />
        <Button
          size="sm"
          variant="plain"
          onClick={state.close}
          aria-keyshortcuts="Escape"
          title="End tour (Esc)"
        >
          End tour
        </Button>
      </div>
      <div className={styles.explanation} key={state.index}>
        <h2>{stop.title}</h2>
        <p className={styles.location}>
          {stop.file}:{stop.start}–{stop.end}
        </p>
        {state.index === 0 && <Markdown>{tour.summary}</Markdown>}
        <Markdown>{stop.body}</Markdown>
        {(state.notes[state.index] ?? []).map((note, index) => (
          <div className={styles.note} key={index}>
            <strong>{note.question}</strong>
            <Markdown>{note.answer}</Markdown>
          </div>
        ))}
        {state.asking && <p role="status">{state.providerName} is answering…</p>}
        {state.error && <p role="alert">{state.error}</p>}
      </div>
      <div className={styles.controls}>
        <Button
          size="sm"
          iconStart={<ArrowLeft aria-hidden />}
          disabled={state.index === 0 || state.asking}
          onClick={() => onStep(state.index - 1)}
        >
          Back
        </Button>
        {!atStop && (
          <Button size="sm" onClick={() => onStep(state.index)}>
            Return to stop
          </Button>
        )}
        <Button
          size="sm"
          disabled={state.asking}
          onClick={() => void state.ask('Explain this more deeply.', 'deeper')}
          aria-keyshortcuts="d"
          title="Deeper (D)"
        >
          Deeper
        </Button>
        <Button
          size="sm"
          disabled={state.asking}
          onClick={() =>
            void state.ask('Explain the technical details and tradeoffs.', 'technical')
          }
          aria-keyshortcuts="t"
          title="More technical (T)"
        >
          More technical
        </Button>
        {state.index < tour.stops.length - 1 ? (
          <Button
            size="sm"
            variant="primary"
            iconEnd={<ArrowRight aria-hidden />}
            disabled={state.asking}
            onClick={() => onStep(state.index + 1)}
          >
            Next
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => void state.finish()}>
            Finish tour
          </Button>
        )}
      </div>
      <form
        className={styles.controls}
        onSubmit={(event) => {
          event.preventDefault();
          if (!question.trim() || state.asking) return;
          void state.ask(question);
          setQuestion('');
        }}
      >
        <input
          ref={askInput}
          aria-keyshortcuts="a"
          title="Ask about this stop (A)"
          aria-label="Ask about this stop"
          placeholder="Ask about this stop…"
          value={question}
          maxLength={4000}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button type="submit" size="sm" loading={state.asking} disabled={!question.trim()}>
          Ask
        </Button>
      </form>
    </section>
  );
}
