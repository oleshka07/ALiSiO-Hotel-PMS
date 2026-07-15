import { NextRequest } from 'next/server';
import { getRegistrationStatus, saveDraftRegistration, handleRegistrationStatusOptions } from '@guests';

export const GET = (req: NextRequest, ctx: { params: Promise<{ token: string }> }) =>
  getRegistrationStatus(req, ctx);

export const PATCH = (req: NextRequest, ctx: { params: Promise<{ token: string }> }) =>
  saveDraftRegistration(req, ctx);

export const OPTIONS = () => handleRegistrationStatusOptions();
