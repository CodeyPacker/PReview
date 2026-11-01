import type { DatabaseSync } from 'node:sqlite';
import {
  findingCategoryLabels,
  type CreateReviewFindingInput,
  type ReviewFinding,
  type SetFindingResolutionInput,
  type UpdateReviewFindingInput,
} from '../../../shared/contracts/review-findings.ts';

interface ReviewFindingRow {
  id: number;
  pull_request_id: number;
  category: ReviewFinding['category'];
  description: string;
  steps: string;
  validation: ReviewFinding['validation'];
  resolution: ReviewFinding['resolution'];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function toFinding(row: ReviewFindingRow): ReviewFinding {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    category: row.category,
    description: row.description,
    steps: row.steps,
    validation: row.validation,
    resolution: row.resolution,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Every finding of a pull request, oldest first.
export function listReviewFindings(db: DatabaseSync, pullRequestId: number): ReviewFinding[] {
  const rows = db
    .prepare(
      `SELECT id, pull_request_id, category, description, steps, validation, resolution,
              published_at, created_at, updated_at
       FROM review_findings
       WHERE pull_request_id = ?
       ORDER BY created_at, id`,
    )
    .all(pullRequestId) as unknown as ReviewFindingRow[];
  return rows.map(toFinding);
}

export function createReviewFinding(
  db: DatabaseSync,
  { pullRequestId, category, description, steps }: CreateReviewFindingInput,
): ReviewFinding[] {
  db.prepare(
    `INSERT INTO review_findings (pull_request_id, category, description, steps)
     VALUES (?, ?, ?, ?)`,
  ).run(pullRequestId, category, description.trim(), steps.trim());
  return listReviewFindings(db, pullRequestId);
}

// GitHub already has a published finding's text, so only unpublished ones change.
export function updateReviewFinding(
  db: DatabaseSync,
  { pullRequestId, id, category, description, steps }: UpdateReviewFindingInput,
): ReviewFinding[] {
  const { changes } = db
    .prepare(
      `UPDATE review_findings
       SET category = ?, description = ?, steps = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND pull_request_id = ? AND published_at IS NULL`,
    )
    .run(category, description.trim(), steps.trim(), id, pullRequestId);
  if (changes === 0) throw new Error('Finding not found or already published.');
  return listReviewFindings(db, pullRequestId);
}

export function setReviewFindingResolution(
  db: DatabaseSync,
  { pullRequestId, id, resolution }: SetFindingResolutionInput,
): ReviewFinding[] {
  const { changes } = db
    .prepare(
      `UPDATE review_findings
       SET resolution = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND pull_request_id = ?`,
    )
    .run(resolution, id, pullRequestId);
  if (changes === 0) throw new Error('Finding not found.');
  return listReviewFindings(db, pullRequestId);
}

// Deletes an unpublished finding. Deleting one that is already gone changes nothing.
export function deleteReviewFinding(
  db: DatabaseSync,
  pullRequestId: number,
  id: number,
): ReviewFinding[] {
  db.prepare(
    'DELETE FROM review_findings WHERE id = ? AND pull_request_id = ? AND published_at IS NULL',
  ).run(id, pullRequestId);
  return listReviewFindings(db, pullRequestId);
}

// The findings as Markdown for a review's body.
export function findingsMarkdown(findings: readonly ReviewFinding[]): string {
  const sections = findings.map((finding, index) => {
    const parts = [
      `### ${index + 1}. ${findingCategoryLabels[finding.category]}`,
      finding.description,
    ];
    if (finding.steps) parts.push('**Steps to reproduce**', finding.steps);
    return parts.join('\n\n');
  });
  return ['## Findings', ...sections].join('\n\n');
}
