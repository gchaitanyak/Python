import { describe, expect, it } from 'vitest';
import { grantGroupSeat, revokeGroupSeat } from '../../functions/src/lib/entitlement';
import { groupName, inviteCodeFrom, memberStats, membersCsv, normaliseInviteCode, seatHolders } from '../../functions/src/lib/groups';

describe('groups', () => {
  it('validates names and invite codes', () => {
    expect(groupName('  Year 10   Python ')).toEqual({ ok: true, name: 'Year 10 Python' });
    expect(groupName('ab').ok).toBe(false);
    expect(groupName('<b>').ok).toBe(false);
    let n = 0;
    expect(inviteCodeFrom(() => n++)).toBe('ABCDEFGH');
    expect(normaliseInviteCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normaliseInviteCode('ABCDEFG0')).toBeUndefined();
  });

  it('summarises a member’s progress', () => {
    expect(memberStats([])).toEqual({ lessonsCompleted: 0, averageAccuracy: null, lastActiveMs: null });
    expect(
      memberStats([
        { completed: true, bestAccuracy: 80, lastPractisedAtMs: 1000 },
        { completed: true, bestAccuracy: 95, lastPractisedAtMs: 3000 },
        { completed: false, bestAccuracy: 10, lastPractisedAtMs: 2000 },
      ]),
    ).toEqual({ lessonsCompleted: 2, averageAccuracy: 88, lastActiveMs: 3000 });
  });

  it('gives seats to the earliest members', () => {
    const m = [
      { uid: 'c', joinedAtMs: 3 },
      { uid: 'a', joinedAtMs: 1 },
      { uid: 'b', joinedAtMs: 2 },
    ];
    expect([...seatHolders(m, 2)]).toEqual(['a', 'b']);
    expect(seatHolders(m, 0).size).toBe(0);
    expect(seatHolders(m, 10).size).toBe(3);
  });

  it('writes CSV with quoting and no spreadsheet formulas', () => {
    const csv = membersCsv([
      { uid: 'u1', username: 'ana', joinedAtMs: Date.UTC(2026, 9, 1), lessonsCompleted: 3, averageAccuracy: 90, lastActiveMs: null, premiumSeat: true },
      { uid: 'u2', username: '=HYPERLINK("x")', joinedAtMs: 0, lessonsCompleted: 0, averageAccuracy: null, lastActiveMs: 0, premiumSeat: false },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('username,joined,lessons_completed,average_accuracy,last_active,premium_seat');
    expect(lines[1]).toBe('ana,2026-10-01T00:00:00.000Z,3,90,,true');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",1970-01-01T00:00:00.000Z,0,,1970-01-01T00:00:00.000Z,false`);
  });
});

describe('group seats and entitlement', () => {
  const now = 1_000_000;
  it('grants premium to free members and leaves paying members’ source alone', () => {
    expect(grantGroupSeat({ entitlement: 'free' }, 'g1', now)).toEqual({ groupPremium: 'g1', entitlement: 'premium', entitlementSource: 'group', premiumUntilMs: null });
    expect(grantGroupSeat({ entitlement: 'premium', entitlementSource: 'stripe', premiumUntilMs: now + 1 }, 'g1', now)).toEqual({ groupPremium: 'g1' });
    expect(grantGroupSeat({ entitlement: 'premium', entitlementSource: 'stripe', premiumUntilMs: now - 1 }, 'g1', now)).toMatchObject({ entitlementSource: 'group' });
  });

  it('removes only premium that came from that group', () => {
    expect(revokeGroupSeat({ groupPremium: 'g2', entitlementSource: 'group' }, 'g1', now)).toBeNull();
    expect(revokeGroupSeat({ groupPremium: 'g1', entitlementSource: 'lifetime' }, 'g1', now)).toEqual({ groupPremium: null });
    expect(revokeGroupSeat({ groupPremium: 'g1', entitlementSource: 'group', entitlement: 'premium' }, 'g1', now)).toEqual({ groupPremium: null, entitlement: 'free', entitlementSource: null, premiumUntilMs: now });
  });
});
