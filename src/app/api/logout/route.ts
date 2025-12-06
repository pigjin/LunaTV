import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // response.cookies.delete('auth');
  return response;
}
