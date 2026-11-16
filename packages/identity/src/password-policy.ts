const COMMON = new Set(['1234567890', 'contraseña', 'contrasena1', 'password123', 'qwertyuiop', '0123456789', 'clubclub123', 'aaaaaaaaaa']);

/** Reglas mínimas, en español. Sin reglas de composición rebuscadas: largo y que no sea obvia. */
export function passwordProblems(password: string, context: { login?: string } = {}): string[] {
  const p = password.normalize('NFKC');
  const problems: string[] = [];
  if (p.length < 10) problems.push('Usá al menos 10 caracteres.');
  if (p.length > 200) problems.push('Usá como máximo 200 caracteres.');
  if (/^(.)\1+$/.test(p) || COMMON.has(p.toLowerCase())) problems.push('Esa contraseña es demasiado fácil de adivinar.');
  if (/^\d+$/.test(p)) problems.push('No uses solo números (por ejemplo, tu documento).');
  if (context.login && p.toLowerCase().includes(context.login.toLowerCase().split('@')[0]!)) problems.push('No uses tu usuario o email dentro de la contraseña.');
  return problems;
}
