export type { Guest } from '@/types/database';

export interface GuestWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  total_stays: number;
  total_revenue: number | null;
  last_check_in: string | null;
  last_booking_status: string | null;
}

export interface CreateGuestInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  documentType?: string;
  documentNumber?: string;
  dateOfBirth?: string;
  notes?: string;
}

export interface RegisteredGuest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  address?: string;
  nationality?: string;
  documentType?: string;
  documentNumber?: string;
  purposeOfStay?: string;
  visaNumber?: string;
}
