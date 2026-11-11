import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../../database/connection.ts';
import {
  savedTourSchema,
  savedTourSummarySchema,
  type SavedTour,
  type SavedTourInput,
  type StartTourInput,
  type Tour,
  type TourProgressInput,
  type TourMessageKind,
} from '../../../shared/contracts/tours.ts';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
export interface TourIdentity {
  repository: string;
  providerId: string;
  number: number;
}

export class TourStore {
  constructor(private readonly db: DatabaseSync) {
    db.prepare(
      `UPDATE tour_messages SET status = 'failed', error = 'The app closed before the answer was saved.', completed_at = ${NOW} WHERE status = 'pending'`,
    ).run();
  }

  identity(pullRequestId: number): TourIdentity {
    const row = this.db
      .prepare(
        `SELECT r.github_owner || '/' || r.github_name AS repository,
      p.provider_id AS providerId, p.number FROM pull_requests p
      JOIN repositories r ON r.id = p.repository_id WHERE p.id = ?`,
      )
      .get(pullRequestId) as TourIdentity | undefined;
    if (!row?.repository) throw new Error('This pull request is no longer available.');
    return { ...row, repository: row.repository.toLowerCase() };
  }

  list(input: StartTourInput) {
    const identity = this.identity(input.pullRequestId);
    const ids = this.db
      .prepare(
        `SELECT MAX(id) AS id FROM tours
      WHERE repository = ? AND pr_provider_id = ? AND head_sha = ? AND merge_base = ?
      GROUP BY provider, depth ORDER BY MAX(updated_at) DESC, MAX(id) DESC`,
      )
      .all(identity.repository, identity.providerId, input.headSha, input.mergeBase) as {
      id: number;
    }[];
    return ids.map(({ id }) => this.summary(id));
  }

  private summary(id: number) {
    const row = this.db
      .prepare(
        `SELECT id, title, provider, depth, current_stop AS currentStop,
      active_ms AS activeMs, generation_ms AS generationMs, created_at AS createdAt,
      updated_at AS updatedAt, completed_at AS completedAt,
      (SELECT COUNT(*) FROM tour_stops WHERE tour_id = tours.id) AS totalStops,
      (SELECT COUNT(*) FROM tour_stops WHERE tour_id = tours.id AND first_visited_at IS NOT NULL) AS visitedStops
      FROM tours WHERE id = ?`,
      )
      .get(id);
    if (!row) throw new Error('This saved tour is no longer available.');
    return savedTourSummarySchema.parse(row);
  }

  get(id: number): SavedTour {
    const summary = this.summary(id);
    const { text } = this.db.prepare('SELECT summary AS text FROM tours WHERE id = ?').get(id) as {
      text: string;
    };
    const stops = this.db
      .prepare(
        `SELECT path AS file, start_line AS start, end_line AS end,
      group_name AS "group", title, body FROM tour_stops WHERE tour_id = ? ORDER BY position`,
      )
      .all(id);
    const messages = this.db
      .prepare(
        `SELECT id, stop_position AS stopIndex, kind, question, answer,
      status, error, created_at AS createdAt, duration_ms AS durationMs
      FROM tour_messages WHERE tour_id = ? ORDER BY id`,
      )
      .all(id);
    return savedTourSchema.parse({
      ...summary,
      plan: { title: summary.title, summary: text, stops },
      messages,
    });
  }

  require(input: SavedTourInput): SavedTour {
    const identity = this.identity(input.pullRequestId);
    const row = this.db
      .prepare(
        `SELECT id FROM tours WHERE id = ? AND repository = ?
      AND pr_provider_id = ? AND head_sha = ? AND merge_base = ?`,
      )
      .get(input.tourId, identity.repository, identity.providerId, input.headSha, input.mergeBase);
    if (!row) throw new Error('This tour does not match the current PR commits. Start a new tour.');
    return this.get(input.tourId);
  }

  create(
    input: StartTourInput,
    identity: TourIdentity,
    plan: Tour,
    generationMs: number,
  ): SavedTour {
    const id = transaction(this.db, () => {
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO tours
        (repository, pr_provider_id, pr_number, head_sha, merge_base, provider, depth, title, summary, generation_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            identity.repository,
            identity.providerId,
            identity.number,
            input.headSha,
            input.mergeBase,
            input.provider ?? 'claude',
            input.depth ?? 'normal',
            plan.title,
            plan.summary,
            generationMs,
          ).lastInsertRowid,
      );
      const insert = this.db.prepare(`INSERT INTO tour_stops
        (tour_id, position, path, start_line, end_line, group_name, title, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      plan.stops.forEach((stop, index) =>
        insert.run(id, index, stop.file, stop.start, stop.end, stop.group, stop.title, stop.body),
      );
      return id;
    });
    return this.get(id);
  }

  private visit(id: number, index: number) {
    const update = this.db
      .prepare(
        `UPDATE tour_stops SET first_visited_at = COALESCE(first_visited_at, ${NOW}),
      last_visited_at = ${NOW}, visit_count = visit_count + 1 WHERE tour_id = ? AND position = ?`,
      )
      .run(id, index);
    if (Number(update.changes) !== 1) throw new Error('This stop is not in the saved tour.');
    this.db
      .prepare(
        `UPDATE tours SET current_stop = ?, started_at = COALESCE(started_at, ${NOW}), updated_at = ${NOW} WHERE id = ?`,
      )
      .run(index, id);
  }

  progress(input: TourProgressInput): null {
    transaction(this.db, () => {
      this.summary(input.tourId);
      if (input.stopIndex !== undefined) this.visit(input.tourId, input.stopIndex);
      this.db
        .prepare(
          `UPDATE tours SET active_ms = MAX(active_ms, ?),
        completed_at = CASE WHEN ? THEN COALESCE(completed_at, ${NOW}) ELSE completed_at END,
        updated_at = ${NOW} WHERE id = ?`,
        )
        .run(input.activeMs ?? 0, Number(input.complete === true), input.tourId);
    });
    return null;
  }

  beginMessage(tourId: number, index: number, kind: TourMessageKind, question: string): number {
    return Number(
      this.db
        .prepare(
          `INSERT INTO tour_messages
      (tour_id, stop_position, kind, question, status) VALUES (?, ?, ?, ?, 'pending')`,
        )
        .run(tourId, index, kind, question).lastInsertRowid,
    );
  }

  finishMessage(id: number, answer: string | null, error: string | null, durationMs: number) {
    this.db
      .prepare(
        `UPDATE tour_messages SET answer = ?, error = ?, status = ?, duration_ms = ?,
      completed_at = ${NOW} WHERE id = ?`,
      )
      .run(answer, error, error === null ? 'completed' : 'failed', durationMs, id);
    this.db
      .prepare(
        `UPDATE tours SET updated_at = ${NOW} WHERE id = (SELECT tour_id FROM tour_messages WHERE id = ?)`,
      )
      .run(id);
  }
}
