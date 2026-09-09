import { createHash, timingSafeEqual } from 'node:crypto';

export function validAccess(request: Request): boolean {
  const user = process.env.APP_AUTH_USER;
  const password = process.env.APP_AUTH_PASSWORD;
  if (!user || !password) return false;
  const header = request.headers.get('authorization');
  if (!header || !/^Basic /i.test(header)) return false;
  const supplied = Buffer.from(header.slice(6), 'base64');
  const digest = (value: Buffer | string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`${user}:${password}`));
}
