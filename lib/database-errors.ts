import { LibsqlError } from '@libsql/client';

export class DatabaseConfigurationError extends Error {}

// Return fixed messages only. Driver errors can contain URLs, SQL or credentials.
export function databaseErrorMessage(error: unknown): string | null {
  if (error instanceof DatabaseConfigurationError) {
    return 'O banco não está configurado corretamente no servidor. Confira TURSO_DATABASE_URL e TURSO_AUTH_TOKEN e faça um novo deploy.';
  }
  if (!(error instanceof LibsqlError)) return null;
  if (error.code === 'SQLITE_ERROR' && /no such table/i.test(error.message)) {
    return 'As tabelas do banco ainda não foram criadas. Execute npm run db:migrate usando o mesmo banco configurado na Vercel.';
  }
  return 'Não foi possível acessar o banco de estoque. Confira a URL, o token e a disponibilidade do Turso.';
}
