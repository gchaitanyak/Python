/**
 * A stand-in for the Claude Messages API, for the emulator and tests (this
 * environment can't reach the real API, and tests shouldn't spend money).
 * getHint talks to it when LLM_API_BASE is set (scripts/emulator-env.mjs).
 *
 * It answers POST /v1/messages with a short hint built from the prompt. If the
 * learner's code contains LEAK_SOLUTION, it misbehaves on purpose and replies
 * with the reference solution, so tests can check that getHint's guard catches it.
 */
import { createServer, type Server } from 'node:http';

export const FAKE_LLM_PORT = 12112;

const between = (text: string, tag: string): string => new RegExp(`<${tag}[^>]*>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(text)?.[1] ?? '';

export function fakeReply(prompt: string): string {
  if (between(prompt, 'learner_code').includes('LEAK_SOLUTION')) {
    return `Sure! Here is the full answer:\n\`\`\`python\n${between(prompt, 'reference_solution')}\n\`\`\`\nJust paste it in.`;
  }
  const failed = between(prompt, 'failed_check').trim();
  return `Your code runs, but one check fails: “${failed}”. Compare what that check expects with the value your code produces — print it to see.`;
}

export function startFakeLlm(port = FAKE_LLM_PORT): Promise<Server> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/health') return void res.end('ok');
    if (req.method !== 'POST' || path !== '/v1/messages') {
      res.statusCode = 404;
      return void res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'Not found' } }));
    }
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const request = JSON.parse(body) as { model: string; messages: { content: string }[] };
      const prompt = String(request.messages.at(-1)?.content ?? '');
      const text = fakeReply(prompt);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          id: `msg_fake_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: request.model,
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(text.length / 4) },
        }),
      );
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
