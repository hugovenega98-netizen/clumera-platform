/** Genera MANAGEMENT_ADMIN_PASSWORD_HASH. Uso: npm run hash-password -w @clumera/management -- "frase larga" */
import { hashPassword, passwordProblems } from '@clumera/identity';

const password = process.argv[2] ?? '';
const problems = passwordProblems(password);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`MANAGEMENT_ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
