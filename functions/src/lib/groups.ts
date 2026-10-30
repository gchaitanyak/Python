/**
 * Groups (SPEC §5.7): pure rules — names, invite codes, the report and its CSV.
 * Firestore work lives in ../groups.ts.
 */
import { credentialIdFrom } from './certificate';

export const INVITE_CODE_LENGTH = 8;
export const MAX_GROUPS_PER_OWNER = 10;
export const MAX_MEMBERS = 500;

/** Group names: 3–60 characters, trimmed, single spaces. */
export function groupName(input: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof input === 'string' ? input.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'Group names are 3–60 characters.' };
  if (/[<>]/.test(name)) return { ok: false, error: 'Group names can’t contain < or >.' };
  return { ok: true, name };
}

/** 8 characters from the certificate alphabet (no look-alikes), e.g. "K7QM2XHP". */
export function inviteCodeFrom(nextByte: () => number): string {
  return credentialIdFrom(nextByte).slice(0, INVITE_CODE_LENGTH);
}

export function normaliseInviteCode(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code) ? code : undefined;
}

export interface MemberRow {
  uid: string;
  username: string;
  joinedAtMs: number;
  lessonsCompleted: number;
  /** Mean best accuracy over completed lessons, rounded; null before the first one. */
  averageAccuracy: number | null;
  lastActiveMs: number | null;
  premiumSeat: boolean;
}

/** One member's row from their completed-lesson records. */
export function memberStats(progress: { completed?: unknown; bestAccuracy?: unknown; lastPractisedAtMs?: number | null }[]) {
  const done = progress.filter((p) => p.completed === true);
  const accuracies = done.map((p) => (typeof p.bestAccuracy === 'number' ? p.bestAccuracy : 0));
  const times = progress.map((p) => p.lastPractisedAtMs).filter((t): t is number => typeof t === 'number');
  return {
    lessonsCompleted: done.length,
    averageAccuracy: accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null,
    lastActiveMs: times.length ? Math.max(...times) : null,
  };
}

/** Members who hold a premium seat: the first `seats` to join. */
export function seatHolders<T extends { uid: string; joinedAtMs: number }>(members: T[], seats: number): Set<string> {
  return new Set([...members].sort((a, b) => a.joinedAtMs - b.joinedAtMs || a.uid.localeCompare(b.uid)).slice(0, Math.max(0, seats)).map((m) => m.uid));
}

const csvCell = (value: string | number | boolean | null): string => {
  const text = value === null ? '' : String(value);
  // Quote when needed; neutralise spreadsheet formulas (a username can't start with these, but be safe).
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function membersCsv(rows: MemberRow[]): string {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const lines = [
    ['username', 'joined', 'lessons_completed', 'average_accuracy', 'last_active', 'premium_seat'],
    ...rows.map((r) => [r.username, iso(r.joinedAtMs), r.lessonsCompleted, r.averageAccuracy, iso(r.lastActiveMs), r.premiumSeat]),
  ];
  return `${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
