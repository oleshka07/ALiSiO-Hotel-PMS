import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANG_MAP: Record<string, string> = {
  cs: 'Czech', en: 'English', de: 'German', uk: 'Ukrainian',
  ru: 'Russian', sk: 'Slovak', pl: 'Polish', fr: 'French',
  it: 'Italian', es: 'Spanish',
};

export async function POST(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  let text: string;
  let targetLang: string;

  try {
    const body = await request.json();
    text = body.text;
    targetLang = body.targetLang;
    if (!text || !targetLang) throw new Error('Missing text or targetLang');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const langName = LANG_MAP[targetLang] || targetLang;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Translate the following hotel response to ${langName}. 
Keep the same tone, meaning, and formatting. Do not add or remove information. 
Output ONLY the translated text, nothing else.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const translated = response.choices[0]?.message?.content;
    if (!translated) {
      return NextResponse.json({ error: 'Translation returned empty' }, { status: 500 });
    }

    return NextResponse.json({ translated, targetLang, langName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AI Translate]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
