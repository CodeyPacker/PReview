import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  StartTourInput,
  Tour,
  TourStop,
  TourDepth,
  TourProvider,
  SavedTour,
  SavedTourSummary,
  TourMessageKind,
} from '../../shared/contracts/tours.ts';
import { useTourTime } from './useTourTime.ts';

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
}

function notesOf(saved: SavedTour) {
  const notes: Record<number, { question: string; answer: string }[]> = {};
  for (const message of saved.messages) {
    if (message.status !== 'completed' || message.answer === null) continue;
    (notes[message.stopIndex] ??= []).push({ question: message.question, answer: message.answer });
  }
  return notes;
}

export function useTour(input: StartTourInput | undefined) {
  const [provider, setProvider] = useState<TourProvider>('claude');
  const [depth, setDepth] = useState<TourDepth>('normal');
  const providerName = provider === 'codex' ? 'Codex' : 'Claude';
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [tour, setTour] = useState<Tour>();
  const [record, setRecord] = useState<SavedTour>();
  const [saved, setSaved] = useState<SavedTourSummary[]>([]);
  const [index, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [notes, setNotes] = useState<Record<number, { question: string; answer: string }[]>>({});
  const request = useRef(0);
  const key = input ? `${input.pullRequestId}:${input.headSha}:${input.mergeBase}` : '';
  const [snapshot, setSnapshot] = useState(key);
  const invalidate = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => invalidate, [key, invalidate]);
  useTourTime(open && tour ? record?.id : undefined, record?.activeMs ?? 0, (error) =>
    setError(`Could not save tour time: ${messageOf(error)}`),
  );
  if (snapshot !== key) {
    setSnapshot(key);
    setOpen(false);
    setTour(undefined);
    setRecord(undefined);
    setSaved([]);
    setPlanning(false);
    setResuming(false);
    setPreparing(false);
    setChoosing(false);
    setAsking(false);
    setError(undefined);
    setNotes({});
  }

  async function prepare() {
    if (!input || preparing || planning) return;
    const id = ++request.current;
    setOpen(true);
    setPreparing(true);
    setChoosing(false);
    setTour(undefined);
    setRecord(undefined);
    setNotes({});
    setError(undefined);
    try {
      const [changes, saved] = await Promise.all([
        window.preview.pullRequestFiles.list(input.pullRequestId),
        window.preview.tours.list(input),
      ]);
      if (id !== request.current) return;
      if (changes.headSha !== input.headSha || changes.mergeBase !== input.mergeBase) {
        throw new Error('The PR changed. Show new commits before starting a tour.');
      }
      if (!changes.files.length) throw new Error('There are no changed files to tour.');
      setSaved(saved);
      const latest = saved[0];
      if (latest) {
        setProvider(latest.provider);
        setDepth(latest.depth);
      }
      setChoosing(true);
    } catch (error) {
      if (id === request.current) setError(messageOf(error));
    } finally {
      if (id === request.current) setPreparing(false);
    }
  }

  async function start(
    onReady: (stop: TourStop) => void,
    depth: TourDepth,
    selectedProvider: TourProvider,
    resumeId?: number,
  ) {
    if (!input || planning) return;
    const id = ++request.current;
    setOpen(true);
    setProvider(selectedProvider);
    setDepth(depth);
    setPlanning(true);
    setResuming(resumeId !== undefined);
    setChoosing(false);
    setTour(undefined);
    setNotes({});
    setError(undefined);
    try {
      const result =
        resumeId === undefined
          ? await window.preview.tours.start({ ...input, depth, provider: selectedProvider })
          : await window.preview.tours.resume({ ...input, tourId: resumeId });
      if (id !== request.current) return;
      setRecord(result);
      setTour(result.plan);
      setProvider(result.provider);
      setDepth(result.depth);
      setCurrentIndex(result.currentStop);
      setNotes(notesOf(result));
      void window.preview.tours
        .progress({ tourId: result.id, stopIndex: result.currentStop })
        .catch((error: unknown) => {
          if (id === request.current) setError(`Could not save tour progress: ${messageOf(error)}`);
        });
      const stop = result.plan.stops[result.currentStop];
      if (stop) onReady(stop);
    } catch (error) {
      if (id === request.current) setError(messageOf(error));
    } finally {
      if (id === request.current) {
        setPlanning(false);
        setResuming(false);
      }
    }
  }

  function setIndex(index: number) {
    if (!record || !tour?.stops[index]) return;
    setCurrentIndex(index);
    const id = request.current;
    void window.preview.tours
      .progress({ tourId: record.id, stopIndex: index })
      .catch((error: unknown) => {
        if (id === request.current) setError(`Could not save tour progress: ${messageOf(error)}`);
      });
  }

  async function ask(question: string, kind: TourMessageKind = 'ask') {
    if (!input || !record || !tour?.stops[index] || asking || !question.trim()) return;
    const id = request.current;
    setAsking(true);
    setError(undefined);
    try {
      const saved = await window.preview.tours.ask({
        ...input,
        tourId: record.id,
        stopIndex: index,
        kind,
        question,
      });
      if (id === request.current) setNotes(notesOf(saved));
    } catch (error) {
      if (id === request.current) setError(messageOf(error));
    } finally {
      if (id === request.current) setAsking(false);
    }
  }

  function close() {
    request.current++;
    setOpen(false);
    setPlanning(false);
    setResuming(false);
    setPreparing(false);
    setChoosing(false);
    setAsking(false);
    setError(undefined);
  }

  async function finish() {
    if (!record) return;
    try {
      await window.preview.tours.progress({ tourId: record.id, complete: true });
      close();
    } catch (error) {
      setError(`Could not save tour completion: ${messageOf(error)}`);
    }
  }

  return {
    open,
    provider,
    setProvider,
    providerName,
    depth,
    setDepth,
    saved,
    resuming,
    planning,
    preparing,
    choosing,
    tour,
    index,
    setIndex,
    error,
    asking,
    notes,
    prepare,
    start,
    ask,
    close,
    finish,
  };
}
