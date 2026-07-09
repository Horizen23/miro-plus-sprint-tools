import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[client-debug]', JSON.stringify(payload, null, 2));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[client-debug] Failed to log payload:', error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
