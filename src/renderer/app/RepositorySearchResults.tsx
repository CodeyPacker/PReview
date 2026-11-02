import { useMemo } from 'react';
import type {
  RepositorySearchMatch,
  RepositorySearchResult,
} from '../../shared/contracts/repository-search.ts';
import { cx } from '../lib/cx.ts';
import styles from './RepositorySearchResults.module.css';

export interface RepositorySearchResultsProps {
  className?: string;
  // Undefined until a search finished.
  result: RepositorySearchResult | undefined;
  tooShort: boolean;
  searching: boolean;
  failed: boolean;
  selected: { path: string; line: number } | undefined;
  onSelect: (match: RepositorySearchMatch) => void;
}

// Matches of a text search, grouped by file.
export function RepositorySearchResults({
  className,
  result,
  tooShort,
  searching,
  failed,
  selected,
  onSelect,
}: RepositorySearchResultsProps) {
  const groups = useMemo(() => {
    const byPath = new Map<string, RepositorySearchMatch[]>();
    for (const match of result?.matches ?? []) {
      byPath.set(match.path, [...(byPath.get(match.path) ?? []), match]);
    }
    return [...byPath];
  }, [result]);

  if (failed) return <p className={styles.message}>The search failed. Try again.</p>;
  if (tooShort) return <p className={styles.message}>Type at least two characters.</p>;
  if (searching)
    return (
      <p role="status" className={styles.message}>
        Searching…
      </p>
    );
  if (!result) return null;

  return (
    <>
      <p role="status" className={styles.message}>
        {result.matches.length === 0
          ? 'No matches.'
          : `${result.matches.length} ${result.matches.length === 1 ? 'match' : 'matches'} in ${groups.length} ${groups.length === 1 ? 'file' : 'files'}.`}
        {result.partial &&
          (result.source === 'clone'
            ? ' Showing the first matches only.'
            : ' Your local clone does not have this commit, so only some files were searched.')}
      </p>
      <div role="list" className={cx(styles.results, className)}>
        {groups.map(([path, matches]) => (
          <div key={path} role="listitem" className={styles.group}>
            <span className={styles.path} title={path}>
              {path}
            </span>
            {matches.map((match) => (
              <button
                key={match.line}
                type="button"
                className={styles.match}
                aria-current={
                  (selected?.path === match.path && selected.line === match.line) || undefined
                }
                onClick={() => onSelect(match)}
              >
                <span className={styles.line}>{match.line}</span>
                <span className={styles.preview}>{match.preview}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
