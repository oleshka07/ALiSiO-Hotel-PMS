import { NextResponse } from 'next/server';
import { resolveFinanceOwner } from './_guard';
import {
  hasFinancePassphrase, setFinancePassphrase, verifyFinancePassphrase,
  unlockFinance, lockFinance, isFinanceUnlocked,
  checkUnlockRateLimit, clearUnlockRateLimit,
} from './_finance-unlock';

const MIN_LEN = 8;

// GET /api/finance/security/status
export async function getFinanceSecurityStatus(_request?: Request): Promise<Response> {
  const r = await resolveFinanceOwner();
  if (r instanceof NextResponse) return r;
  return NextResponse.json({
    hasPassphrase: hasFinancePassphrase(r.user.id),
    unlocked: isFinanceUnlocked(r.sessionId),
  });
}

// POST /api/finance/security/setup  { passphrase }
export async function setupFinancePassphrase(request: Request): Promise<Response> {
  const r = await resolveFinanceOwner();
  if (r instanceof NextResponse) return r;
  if (hasFinancePassphrase(r.user.id)) {
    return NextResponse.json(
      { error: 'Пароль фінансів уже встановлено', code: 'ALREADY_SET' },
      { status: 409 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const passphrase = typeof body?.passphrase === 'string' ? body.passphrase : '';
  if (passphrase.length < MIN_LEN) {
    return NextResponse.json(
      { error: `Пароль має містити щонайменше ${MIN_LEN} символів` },
      { status: 400 },
    );
  }
  setFinancePassphrase(r.user.id, passphrase);
  unlockFinance(r.sessionId);
  return NextResponse.json({ ok: true });
}

// POST /api/finance/security/unlock  { passphrase }
export async function unlockFinanceHandler(request: Request): Promise<Response> {
  const r = await resolveFinanceOwner();
  if (r instanceof NextResponse) return r;

  if (!hasFinancePassphrase(r.user.id)) {
    return NextResponse.json(
      { error: 'Пароль фінансів не встановлено', code: 'NOT_SET' },
      { status: 400 },
    );
  }
  if (!checkUnlockRateLimit(r.user.id)) {
    return NextResponse.json(
      { error: 'Забагато спроб. Спробуйте через 15 хвилин.', code: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const passphrase = typeof body?.passphrase === 'string' ? body.passphrase : '';
  if (!passphrase) {
    return NextResponse.json({ error: 'Введіть пароль' }, { status: 400 });
  }
  if (!verifyFinancePassphrase(r.user.id, passphrase)) {
    return NextResponse.json(
      { error: 'Невірний пароль', code: 'INVALID_PASSPHRASE' },
      { status: 401 },
    );
  }

  clearUnlockRateLimit(r.user.id);
  unlockFinance(r.sessionId);
  return NextResponse.json({ ok: true });
}

// POST /api/finance/security/lock
export async function lockFinanceHandler(_request?: Request): Promise<Response> {
  const r = await resolveFinanceOwner();
  if (r instanceof NextResponse) return r;
  lockFinance(r.sessionId);
  return NextResponse.json({ ok: true });
}
