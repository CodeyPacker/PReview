import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../../database/connection.ts';
import {
  findingCategoryLabels,
  MAX_FINDING_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_DATA_URL_PREFIX,
  type CreateReviewFindingInput,
  type ReviewFinding,
  type SetFindingResolutionInput,
  type UpdateReviewFindingInput,
} from '../../../shared/contracts/review-findings.ts';
import { awardFinding } from '../progression/xp.ts';

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

function toFinding(row: ReviewFindingRow, screenshotIds: number[]): ReviewFinding {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    category: row.category,
    description: row.description,
    steps: row.steps,
    screenshotIds,
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
  const screenshots = db
    .prepare(
      `SELECT s.id, s.finding_id FROM finding_screenshots s
       JOIN review_findings f ON f.id = s.finding_id
       WHERE f.pull_request_id = ?
       ORDER BY s.id`,
    )
    .all(pullRequestId) as unknown as { id: number; finding_id: number }[];
  return rows.map((row) =>
    toFinding(
      row,
      screenshots.filter(({ finding_id }) => finding_id === row.id).map(({ id }) => id),
    ),
  );
}

// The image bytes of a data URL. The bytes must really be WebP, because Claude rejects an image
// whose type is wrong and that would fail the agent's whole run.
function decodeScreenshot(dataUrl: string): Buffer {
  const data = Buffer.from(dataUrl.slice(SCREENSHOT_DATA_URL_PREFIX.length), 'base64');
  const webp =
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!webp) throw new Error('A screenshot is not a WebP image.');
  if (data.length > MAX_SCREENSHOT_BYTES) throw new Error('A screenshot is too large.');
  return data;
}

function addScreenshots(db: DatabaseSync, findingId: number, dataUrls: readonly string[]): void {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM finding_screenshots WHERE finding_id = ?')
    .get(findingId) as { total: number };
  if (total + dataUrls.length > MAX_FINDING_SCREENSHOTS) {
    throw new Error(`A finding can have ${MAX_FINDING_SCREENSHOTS} screenshots.`);
  }
  const insert = db.prepare('INSERT INTO finding_screenshots (finding_id, data) VALUES (?, ?)');
  for (const dataUrl of dataUrls) insert.run(findingId, decodeScreenshot(dataUrl));
}

// One screenshot as a data URL, or null when it is gone.
export function getFindingScreenshot(db: DatabaseSync, id: number): string | null {
  const row = db.prepare('SELECT data FROM finding_screenshots WHERE id = ?').get(id) as
    { data: Uint8Array } | undefined;
  return row ? SCREENSHOT_DATA_URL_PREFIX + Buffer.from(row.data).toString('base64') : null;
}

export function createReviewFinding(
  db: DatabaseSync,
  { pullRequestId, category, description, steps, newScreenshots }: CreateReviewFindingInput,
): ReviewFinding[] {
  transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO review_findings (pull_request_id, category, description, steps)
         VALUES (?, ?, ?, ?)`,
      )
      .run(pullRequestId, category, description.trim(), steps.trim());
    addScreenshots(db, Number(lastInsertRowid), newScreenshots);
  });
  return listReviewFindings(db, pullRequestId);
}

// GitHub already has a published finding's text, so only unpublished ones change.
export function updateReviewFinding(
  db: DatabaseSync,
  {
    pullRequestId,
    id,
    category,
    description,
    steps,
    screenshotIds,
    newScreenshots,
  }: UpdateReviewFindingInput,
): ReviewFinding[] {
  transaction(db, () => {
    const { changes } = db
      .prepare(
        `UPDATE review_findings
         SET category = ?, description = ?, steps = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND pull_request_id = ? AND published_at IS NULL`,
      )
      .run(category, description.trim(), steps.trim(), id, pullRequestId);
    if (changes === 0) throw new Error('Finding not found or already published.');
    db.prepare(
      `DELETE FROM finding_screenshots
       WHERE finding_id = ? AND id NOT IN (SELECT value FROM json_each(?))`,
    ).run(id, JSON.stringify(screenshotIds));
    addScreenshots(db, id, newScreenshots);
  });
  return listReviewFindings(db, pullRequestId);
}

// Resolving a finding an agent validated awards its XP.
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
  awardFinding(db, id);
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
