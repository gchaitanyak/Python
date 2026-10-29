/**
 * Certificate PDF, built in the browser with no library: the certificate is
 * drawn on a canvas (so names in any script render with the system's fonts),
 * saved as JPEG, and placed full-page in a one-page A4 landscape PDF.
 */
import type { Certificate } from './session';

export const PAGE = { width: 842, height: 595 }; // A4 landscape, in points
const SCALE = 2.5; // canvas pixels per point (~180 dpi)

const enc = new TextEncoder();

/** PDF text string that survives any characters: UTF-16BE in hex with a BOM. */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** A one-page PDF showing a JPEG across the whole page. */
export function jpegPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number, title: string): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const draw = `q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /Im0 Do Q`;
  object(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  object(6, `<< /Title ${pdfText(title)} /Producer (Python Exercises) >>`);

  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Largest font size (px) at which `text` fits in `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxWidth: number): number {
  let px = start;
  ctx.font = font(px);
  while (px > 12 && ctx.measureText(text).width > maxWidth) ctx.font = font((px -= 2));
  return px;
}

export function drawCertificate(canvas: HTMLCanvasElement, cert: Certificate, site: string, url: string): void {
  const w = Math.round(PAGE.width * SCALE);
  const h = Math.round(PAGE.height * SCALE);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const u = SCALE; // 1 point
  const serif = (px: number) => `${px}px Georgia, 'Times New Roman', serif`;
  const sans = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1b1f24';
  ctx.lineWidth = 3 * u;
  ctx.strokeRect(24 * u, 24 * u, w - 48 * u, h - 48 * u);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(32 * u, 32 * u, w - 64 * u, h - 64 * u);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1b1f24';
  ctx.font = sans(700, 14 * u);
  ctx.fillText(site.toUpperCase(), w / 2, 84 * u);
  ctx.font = serif(36 * u);
  ctx.fillText('Certificate of Completion', w / 2, 140 * u);
  ctx.fillStyle = '#4a5260';
  ctx.font = sans(400, 14 * u);
  ctx.fillText('This certifies that', w / 2, 184 * u);

  ctx.fillStyle = '#1b1f24';
  fit(ctx, cert.name, serif, 44 * u, w - 160 * u);
  ctx.fillText(cert.name, w / 2, 240 * u);
  ctx.strokeStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 220 * u, 256 * u);
  ctx.lineTo(w / 2 + 220 * u, 256 * u);
  ctx.stroke();

  ctx.fillStyle = '#4a5260';
  ctx.font = sans(400, 14 * u);
  ctx.fillText(`has completed every lesson in ${cert.modules.length} modules of the ${site} course:`, w / 2, 290 * u);

  // Module titles in two centred columns.
  ctx.fillStyle = '#1b1f24';
  ctx.font = sans(400, 11 * u);
  const half = Math.ceil(cert.modules.length / 2);
  cert.modules.forEach((m, i) => {
    const col = i < half ? 0 : 1;
    const row = col === 0 ? i : i - half;
    ctx.textAlign = col === 0 ? 'right' : 'left';
    ctx.fillText(m.title, w / 2 + (col === 0 ? -16 : 16) * u, (318 + row * 17) * u);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a5260';
  ctx.font = sans(400, 11 * u);
  const issued = cert.issuedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  ctx.fillText(`Issued ${issued}  ·  Credential ID ${cert.id}`, w / 2, h - 76 * u);
  ctx.fillText(`Verify at ${url}`, w / 2, h - 58 * u);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Draws the certificate and returns it as a PDF blob. */
export function certificatePdf(cert: Certificate, site: string, url: string): Blob {
  const canvas = document.createElement('canvas');
  drawCertificate(canvas, cert, site, url);
  const jpeg = base64ToBytes(canvas.toDataURL('image/jpeg', 0.92).split(',')[1] ?? '');
  const pdf = jpegPdf(jpeg, canvas.width, canvas.height, `${site} certificate — ${cert.name}`);
  return new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
}
