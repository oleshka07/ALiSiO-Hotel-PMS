// ─── Booking Widget Types ───
import type { BookingLang } from './translations';

export interface UnitResult {
  id: string;
  name: string;
  code: string;
  beds: number;
  unitTypeId: string;
  typeName: string;
  typeCode: string;
  description: string;
  photos: string[];
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
  avgPricePerNight: number;
  totalPrice: number;
  currency: string;
  extraPersonCharge: number;
  petAllowed: boolean;
  petCharge: number;
  amenities: { icon: string; name: string }[];
  prices?: { date: string; price: number }[];
}

export interface ActiveRatePlan {
  id: string;
  code?: string;
  name: string;
  includedServices?: string[];
}

export interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  units: UnitResult[];
  activeRatePlan?: ActiveRatePlan | null;
}

export interface ReserveResponse {
  success: boolean;
  reservationId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  currency: string;
}

export interface DesignConfig {
  theme?: string;
  primary_color?: string;
  button_style?: string;
  show_shadow?: boolean;
}

export type { BookingLang };
