import '../../lib/page';
import { escapeHtml } from '../../components/html';
import { loginUrl } from '../../lib/page';
import { call, currentSession, errorMessage } from '../../lib/session';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const code = new URLSearchParams(location.search).get('code') ?? '';
const here = location.pathname + location.search;

function say(kind: 'info' | 'error' | 'success', html: string): void {
  const status = $('[data-status]');
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

void (async () => {
  const session = await currentSession().catch(() => null);
  $('[data-loading]').hidden = true;
  if (!code) return say('error', 'This page needs an invite link from your group admin.');
  if (!session) {
    return say('info', `<a href="/register/?next=${encodeURIComponent(here)}">Create a free account</a> or <a href="${loginUrl(here)}">log in</a> to join your group.`);
  }
  try {
    const info = await call<{ name: string; memberCount: number; member: boolean }>('groupForInvite', { code });
    if (info.member) return say('success', `You’re already in <strong>${escapeHtml(info.name)}</strong>. <a href="/learn/">Go to your dashboard</a>.`);
    $('[data-group-name]').textContent = info.name;
    $('[data-group-size]').textContent = `${info.memberCount} ${info.memberCount === 1 ? 'member' : 'members'}`;
    $('[data-invite]').hidden = false;
  } catch (err) {
    return say('error', errorMessage(err));
  }
  const button = $<HTMLButtonElement>('[data-join]');
  button.addEventListener('click', () => {
    button.disabled = true;
    void call<{ name: string; premiumSeat: boolean }>('joinGroup', { code }).then(
      (r) => {
        $('[data-invite]').hidden = true;
        say('success', `You joined <strong>${escapeHtml(r.name)}</strong>.${r.premiumSeat ? ' Your group gives you premium — every lesson is unlocked.' : ''} <a href="/learn/">Start learning</a>.`);
      },
      (err) => {
        button.disabled = false;
        say('error', errorMessage(err));
      },
    );
  });
})();
