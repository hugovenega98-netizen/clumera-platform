/** Solo rutas internas: evita redirecciones abiertas con ?next=https://otro-sitio. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
