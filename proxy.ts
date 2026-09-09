import { NextResponse, type NextRequest } from 'next/server';
import { validAccess } from './lib/auth';

export function proxy(request: NextRequest) {
  if (!process.env.APP_AUTH_USER || !process.env.APP_AUTH_PASSWORD) {
    return new NextResponse('Configure APP_AUTH_USER e APP_AUTH_PASSWORD nas variáveis de ambiente da Vercel e publique novamente.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (!validAccess(request)) {
    return new NextResponse('Entre com seu usuário e senha para consultar o estoque.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Estoque", charset="UTF-8"', 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.next();
}

// Machine jobs validate their independent bearer token inside the route.
export const config = { matcher: ['/', '/api/inventory', '/api/agent', '/api/rules', '/api/sync'] };
