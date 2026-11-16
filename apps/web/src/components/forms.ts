'use client';

export interface ApiError {
  code: string;
  message: string;
  details?: { problems?: string[] } & Record<string, unknown>;
}

/** POST JSON a la API propia. Devuelve el cuerpo o un error legible. */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: ApiError };
    if (res.ok) return { ok: true, data };
    return { ok: false, error: data.error ?? { code: 'http', message: `Error ${res.status}` } };
  } catch {
    return { ok: false, error: { code: 'network', message: 'No hay conexión. Probá de nuevo.' } };
  }
}
