import { plans, PREMIUM_FEATURES } from '../lib/plans';
import { escapeHtml } from './html';

/** Plan cards for /pricing/, rendered at build time. Buttons start Checkout (pricing/main.ts). */
export function renderPlans(env: Record<string, string | undefined> = {}): string {
  return plans(env).map(
    (p) => `<li class="plan${p.highlight ? ' plan--highlight' : ''}">
  ${p.highlight ? `<p class="plan__badge">${escapeHtml(p.highlight)}</p>` : ''}
  <h2 class="plan__name">${escapeHtml(p.name)}</h2>
  <p class="plan__price"><span class="plan__amount">${escapeHtml(p.price)}</span> <span class="plan__period">${escapeHtml(p.period)}</span></p>
  <p class="plan__note">${escapeHtml(p.note)}</p>
  <button class="btn ${p.highlight ? 'btn--primary' : 'btn--ghost'}" type="button" data-plan="${p.id}">Choose ${escapeHtml(p.name.toLowerCase())}</button>
</li>`,
  ).join('');
}

export const renderPremiumFeatures = (): string => PREMIUM_FEATURES.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
