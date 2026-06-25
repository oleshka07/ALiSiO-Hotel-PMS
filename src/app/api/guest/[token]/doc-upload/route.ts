import { NextRequest } from 'next/server';
import { uploadGuestDoc, handleDocUploadOptions } from '@guests';

export const POST = (req: NextRequest, ctx: { params: Promise<{ token: string }> }) =>
  uploadGuestDoc(req, ctx);

export const OPTIONS = () => handleDocUploadOptions();
