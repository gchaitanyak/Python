/**
 * A tiny local stand-in for Stripe, used by `npm run dev`, the e2e tests and the
 * functions tests (the build environment can't reach api.stripe.com).
 *
 * - The API calls our functions make: customers, checkout sessions, portal sessions, subscriptions.
 * - Hosted pages: /checkout/:id (Pay / Cancel) and /portal/:id (cancel at period end, resume, end now).
 * - Webhooks: real Stripe-format events, signed with the webhook secret, posted to stripeWebhook.
 *
 * It is NOT Stripe: before launch, run the real test-mode flow in docs/STRIPE.md.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import Stripe from 'stripe';

export const FAKE_STRIPE_PORT = 12111;
export const FAKE_WEBHOOK_SECRET = 'whsec_fake_emulator_secret';
export const FAKE_SECRET_KEY = 'sk_test_fake_emulator';
const DEFAULT_WEBHOOK = 'http://127.0.0.1:5001/demo-python-exercises/us-central1/stripeWebhook';

type Obj = Record<string, unknown>;
const DAY = 86_400;

interface State {
  customers: Map<string, Obj>;
  sessions: Map<string, Obj>;
  subscriptions: Map<string, Obj>;
  portals: Map<string, Obj>;
}

let counter = 0;
const id = (prefix: string) => `${prefix}_fake${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Stripe's form encoding (`metadata[uid]=…`, `line_items[0][price]=…`) → nested object. */
function parseForm(body: string): Obj {
  const out: Obj = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, '').split('[');
    let node = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Obj;
    });
  }
  return out;
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
}

const redirect = (res: ServerResponse, to: string) => {
  res.writeHead(303, { Location: to });
  res.end();
};

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1b1f24}button{font:inherit;padding:.6rem 1rem;margin:.25rem 0;border-radius:6px;border:1px solid #2353b8;background:#2353b8;color:#fff;cursor:pointer}button.secondary{background:#fff;color:#2353b8}.badge{background:#fff3cd;padding:.1rem .5rem;border-radius:99px}</style></head>
<body><p class="badge">Fake Stripe · local test mode</p>${body}</body></html>`;

export function startFakeStripe(options: { port?: number; webhookUrl?: string; webhookSecret?: string } = {}): Promise<Server> {
  const port = options.port ?? FAKE_STRIPE_PORT;
  const webhookUrl = options.webhookUrl ?? process.env.FAKE_STRIPE_WEBHOOK_URL ?? DEFAULT_WEBHOOK;
  const secret = options.webhookSecret ?? FAKE_WEBHOOK_SECRET;
  const base = `http://127.0.0.1:${port}`;
  const state: State = { customers: new Map(), sessions: new Map(), subscriptions: new Map(), portals: new Map() };

  async function emit(type: string, object: Obj): Promise<void> {
    const payload = JSON.stringify({
      id: id('evt'),
      object: 'event',
      type,
      api_version: '2026-09-30.endive',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(webhookUrl, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header } });
    if (!res.ok) console.error(`[fake-stripe] webhook ${type} → ${res.status} ${await res.text()}`);
  }

  function newSubscription(session: Obj): Obj {
    const metadata = ((session.subscription_data as Obj | undefined)?.metadata ?? {}) as Obj;
    const now = Math.floor(Date.now() / 1000);
    const days = metadata.plan === 'annual' ? 365 : 30;
    const sub: Obj = {
      id: id('sub'),
      object: 'subscription',
      customer: session.customer,
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: null,
      metadata,
      items: { object: 'list', data: [{ id: id('si'), object: 'subscription_item', current_period_start: now, current_period_end: now + days * DAY }] },
    };
    state.subscriptions.set(sub.id as string, sub);
    return sub;
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const params = req.method === 'POST' ? parseForm(await readBody(req)) : {};
    if (req.method === 'POST' && path === '/v1/customers') {
      const customer = { id: id('cus'), object: 'customer', email: params.email ?? null, metadata: params.metadata ?? {} };
      state.customers.set(customer.id, customer);
      return send(res, 200, customer);
    }
    if (req.method === 'POST' && path === '/v1/checkout/sessions') {
      const sid = id('cs_test');
      const session: Obj = { id: sid, object: 'checkout.session', status: 'open', payment_status: 'unpaid', url: `${base}/checkout/${sid}`, subscription: null, ...params };
      state.sessions.set(sid, session);
      return send(res, 200, session);
    }
    if (req.method === 'POST' && path === '/v1/billing_portal/sessions') {
      const pid = id('bps');
      const portal = { id: pid, object: 'billing_portal.session', url: `${base}/portal/${pid}`, ...params };
      state.portals.set(pid, portal);
      return send(res, 200, portal);
    }
    const sub = /^\/v1\/subscriptions\/([\w]+)$/.exec(path);
    const found = sub?.[1] ? state.subscriptions.get(sub[1]) : undefined;
    if (sub?.[1] && !found) return send(res, 404, { error: { type: 'invalid_request_error', message: 'No such subscription' } });
    if (req.method === 'GET' && found) return send(res, 200, found);
    if (req.method === 'DELETE' && found) {
      found.status = 'canceled';
      found.cancel_at_period_end = false;
      await emit('customer.subscription.deleted', found);
      return send(res, 200, found);
    }
    send(res, 404, { error: { type: 'invalid_request_error', message: `Fake Stripe doesn't implement ${req.method} ${path}` } });
  }

  async function checkout(req: IncomingMessage, res: ServerResponse, sid: string, action?: string): Promise<void> {
    const session = state.sessions.get(sid);
    if (!session) return send(res, 404, 'Unknown checkout session', 'text/plain');
    const plan = ((session.metadata as Obj | undefined)?.plan as string) ?? '?';
    if (req.method === 'GET') {
      return send(
        res,
        200,
        page(
          'Checkout',
          `<h1>Pay for the ${plan} plan</h1><p>Test mode: no real money moves.</p>
           <form method="post" action="/checkout/${sid}/pay"><button type="submit">Pay</button></form>
           <form method="post" action="/checkout/${sid}/cancel"><button class="secondary" type="submit">Cancel and go back</button></form>`,
        ),
        'text/html',
      );
    }
    await readBody(req);
    if (action === 'cancel') return redirect(res, session.cancel_url as string);
    session.status = 'complete';
    session.payment_status = 'paid';
    if (session.mode === 'subscription') {
      const subscription = newSubscription(session);
      session.subscription = subscription.id;
      await emit('checkout.session.completed', session);
      await emit('customer.subscription.created', subscription);
    } else {
      await emit('checkout.session.completed', session);
    }
    redirect(res, session.success_url as string);
  }

  async function portal(req: IncomingMessage, res: ServerResponse, pid: string, action?: string, subId?: string): Promise<void> {
    const session = state.portals.get(pid);
    if (!session) return send(res, 404, 'Unknown portal session', 'text/plain');
    const subs = [...state.subscriptions.values()].filter((s) => s.customer === session.customer);
    if (req.method === 'GET') {
      const rows = subs
        .map((s) => {
          const end = new Date(((s.items as { data: { current_period_end: number }[] }).data[0]!.current_period_end) * 1000).toISOString().slice(0, 10);
          const status = s.status === 'canceled' ? 'Cancelled' : s.cancel_at_period_end ? `Cancels on ${end}` : `Renews on ${end}`;
          const buttons =
            s.status === 'canceled'
              ? ''
              : s.cancel_at_period_end
                ? `<form method="post" action="/portal/${pid}/resume/${s.id}"><button type="submit">Resume subscription</button></form>`
                : `<form method="post" action="/portal/${pid}/cancel-at-period-end/${s.id}"><button type="submit">Cancel at period end</button></form>`;
          const endNow = s.status === 'canceled' ? '' : `<form method="post" action="/portal/${pid}/end-now/${s.id}"><button class="secondary" type="submit">End subscription now</button></form>`;
          return `<section><h2>${(s.metadata as Obj).plan ?? 'Plan'}</h2><p data-status>${status}</p>${buttons}${endNow}</section>`;
        })
        .join('');
      return send(res, 200, page('Billing', `<h1>Manage subscription</h1>${rows || '<p>No subscriptions.</p>'}<p><a href="${session.return_url}">Return to Python Exercises</a></p>`), 'text/html');
    }
    await readBody(req);
    const sub = subId ? state.subscriptions.get(subId) : undefined;
    if (!sub) return send(res, 404, 'Unknown subscription', 'text/plain');
    if (action === 'cancel-at-period-end' || action === 'resume') {
      sub.cancel_at_period_end = action === 'cancel-at-period-end';
      await emit('customer.subscription.updated', sub);
    } else if (action === 'end-now') {
      // Stands in for both "cancel immediately" and "the period has ended".
      sub.status = 'canceled';
      sub.cancel_at_period_end = false;
      await emit('customer.subscription.deleted', sub);
    }
    redirect(res, `/portal/${pid}`);
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    const run = async () => {
      if (path === '/health') return send(res, 200, { ok: true });
      if (path.startsWith('/v1/')) return api(req, res, path);
      const c = /^\/checkout\/([\w]+)(?:\/(pay|cancel))?$/.exec(path);
      if (c?.[1]) return checkout(req, res, c[1], c[2]);
      const p = /^\/portal\/([\w]+)(?:\/([\w-]+)\/([\w]+))?$/.exec(path);
      if (p?.[1]) return portal(req, res, p[1], p[2], p[3]);
      send(res, 404, 'Not found', 'text/plain');
    };
    run().catch((err) => send(res, 500, { error: { message: String(err) } }));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
