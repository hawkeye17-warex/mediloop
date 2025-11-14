const RAW_BASE = import.meta.env.VITE_API_URL || '';
const NORMALIZED_BASE = RAW_BASE.replace(/\/+$/, '');

export const API_BASE = NORMALIZED_BASE;

type Options = RequestInit & { json?: unknown };

export async function apiFetch(path: string, opts: Options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let resolvedPath = normalizedPath;
  if (API_BASE && API_BASE.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    resolvedPath = normalizedPath.slice(4);
  }
  const url = API_BASE ? `${API_BASE}${resolvedPath}` : normalizedPath;
  const headers = new Headers(opts.headers || {});
  if (opts.json !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });
  return res;
}

export async function getJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Unexpected response: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}
