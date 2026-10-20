const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Click handler attributes, dispatched by the delegate in main.ts. */
export function act(name: string, arg?: unknown): string {
  return `data-act="${name}"${arg === undefined ? '' : ` data-arg="${esc(JSON.stringify(arg))}"`}`;
}
