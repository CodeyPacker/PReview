import type { DatabaseSync } from 'node:sqlite';
import type { ClearReviewDataResult } from '../../../shared/contracts/pull-requests.ts';
import { transaction } from '../../database/connection.ts';

// Deletes unsent comments, findings and their screenshots, sent reviews and agent history. XP
// stays, because it has no link to these rows. Refused while an agent or a review send still
// needs them.
export function clearReviewData(db: DatabaseSync): ClearReviewDataResult {
  const { busy } = db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM agent_tasks WHERE status IN ('queued', 'running', 'waiting'))
           OR EXISTS (SELECT 1 FROM review_submissions WHERE state = 'publishing') AS busy`,
    )
    .get() as { busy: number };
  if (busy === 1) return { status: 'busy' };
  transaction(db, () => {
    db.exec(`
      DELETE FROM review_drafts;
      DELETE FROM review_findings;
      DELETE FROM review_submissions;
    `);
  });
  // Without this the deleted text stays in the database file's free space.
  db.exec('VACUUM');
  return { status: 'cleared' };
}
