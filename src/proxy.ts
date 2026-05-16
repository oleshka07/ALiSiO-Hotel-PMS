import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MOBILE_UA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Allow force override via cookie (for testing)
  const forceDevice = request.cookies.get('force-device')?.value;
  if (forceDevice) {
    response.headers.set('x-device-type', forceDevice);
    return response;
  }

  const ua = request.headers.get('user-agent') || '';
  const deviceType = MOBILE_UA.test(ua) ? 'mobile' : 'desktop';
  response.headers.set('x-device-type', deviceType);

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icons|widget|guest).*)'],
};
