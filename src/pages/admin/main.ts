import '../../lib/page';
import '../../styles/curriculum.css';
import '../../styles/admin.css';
import { escapeHtml } from '../../components/html';
import { loginUrl } from '../../lib/page';
import { call, currentSession, errorMessage, type Session } from '../../lib/session';

interface Report {
  group: { id: string; name: string; inviteCode: string; premiumSeats: number; memberCount: number };
  members: { uid: string; username: string; lessonsCompleted: number; averageAccuracy: number | null; lastActiveMs: number | null; premiumSeat: boolean }[];
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const select = $<HTMLSelectElement>('[data-group-select]');
let current: Report | undefined;

function say(kind: 'info' | 'error' | 'success', html: string): void {
  const status = $('[data-status]');
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

const inviteUrl = (code: string) => `${location.origin}/join/?code=${code}`;
const date = (ms: number | null) => (ms === null ? '—' : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));

function renderReport(r: Report): void {
  current = r;
  $('[data-group]').hidden = false;
  $('[data-group-name]').textContent = r.group.name;
  $('[data-member-count]').textContent = String(r.group.memberCount);
  const used = r.members.filter((m) => m.premiumSeat).length;
  $('[data-seats]').innerHTML = r.group.premiumSeats
    ? `${used} of ${r.group.premiumSeats} in use`
    : 'None — <a href="mailto:hello@example.com?subject=Premium%20seats">ask us</a> to add premium for your members';
  $<HTMLInputElement>('[data-invite]').value = inviteUrl(r.group.inviteCode);
  $('[data-empty]').hidden = r.members.length > 0;
  $('[data-table-wrap]').hidden = r.members.length === 0;
  $('[data-members]').innerHTML = r.members
    .map(
      (m) => `<tr data-member="${m.uid}">
  <th scope="row">${escapeHtml(m.username)}${m.premiumSeat ? ' <span class="badge badge--premium">Premium seat</span>' : ''}</th>
  <td>${m.lessonsCompleted}</td>
  <td>${m.averageAccuracy === null ? '—' : `${m.averageAccuracy}%`}</td>
  <td>${date(m.lastActiveMs)}</td>
  <td class="table__actions"><button class="btn btn--ghost btn--sm" type="button" data-make-admin="${m.uid}">Make admin</button><button class="btn btn--ghost btn--sm" type="button" data-remove="${m.uid}" aria-label="Remove ${escapeHtml(m.username)}">Remove</button></td>
</tr>`,
    )
    .join('');
}

async function load(groupId: string): Promise<void> {
  try {
    renderReport(await call<Report>('groupReport', { groupId }));
  } catch (err) {
    say('error', errorMessage(err));
  }
}

function fillPicker(session: Session, selectId?: string): void {
  const groups = Object.entries(session.profile?.groups ?? {}).filter(([, g]) => g.role === 'admin');
  $('[data-no-groups]').hidden = groups.length > 0;
  $('[data-picker]').hidden = groups.length === 0;
  select.innerHTML = groups.map(([id, g]) => `<option value="${id}">${escapeHtml(g.name)}</option>`).join('');
  if (selectId) select.value = selectId;
  if (groups.length) void load(select.value);
}

async function withButton(button: HTMLButtonElement, work: () => Promise<void>): Promise<void> {
  button.disabled = true;
  try {
    await work();
  } catch (err) {
    say('error', errorMessage(err));
  } finally {
    button.disabled = false;
  }
}

void (async () => {
  const session = await currentSession().catch(() => null);
  $('[data-loading]').hidden = true;
  if (!session) return say('info', `<a href="${loginUrl()}">Log in</a> to run a group.`);
  $('[data-admin]').hidden = false;
  fillPicker(session);

  select.addEventListener('change', () => void load(select.value));

  const form = $<HTMLFormElement>('[data-create-form]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void withButton(form.querySelector('button')!, async () => {
      const { groupId } = await call<{ groupId: string }>('createGroup', { name: $<HTMLInputElement>('#group-name').value });
      form.reset();
      const fresh = await currentSession();
      if (fresh) fillPicker(fresh, groupId);
      say('success', 'Group created. Share the invite link with your members.');
    });
  });

  $('[data-copy]').addEventListener('click', () => {
    const link = $<HTMLInputElement>('[data-invite]').value;
    void navigator.clipboard.writeText(link).then(
      () => say('success', 'Invite link copied.'),
      () => $<HTMLInputElement>('[data-invite]').select(),
    );
  });

  $('[data-regenerate]').addEventListener('click', (e) => {
    if (!current || !confirm('Make a new invite link? The old one will stop working.')) return;
    const groupId = current.group.id;
    void withButton(e.currentTarget as HTMLButtonElement, async () => {
      await call('regenerateInvite', { groupId });
      await load(groupId);
      say('success', 'New invite link ready.');
    });
  });

  $('[data-export]').addEventListener('click', (e) => {
    if (!current) return;
    const groupId = current.group.id;
    void withButton(e.currentTarget as HTMLButtonElement, async () => {
      const { csv, filename } = await call<{ csv: string; filename: string }>('exportGroupCsv', { groupId });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    });
  });

  $('[data-members]').addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !current) return;
    const groupId = current.group.id;
    const uid = button.dataset.remove ?? button.dataset.makeAdmin;
    const member = current.members.find((m) => m.uid === uid);
    if (!uid || !member) return;
    if (button.dataset.remove) {
      if (!confirm(`Remove ${member.username} from the group?`)) return;
      void withButton(button, async () => {
        await call('removeMember', { groupId, uid });
        await load(groupId);
        say('success', `${escapeHtml(member.username)} was removed.`);
      });
    } else {
      void withButton(button, async () => {
        await call('addGroupAdmin', { groupId, uid });
        say('success', `${escapeHtml(member.username)} is now an admin of this group.`);
      });
    }
  });
})();
