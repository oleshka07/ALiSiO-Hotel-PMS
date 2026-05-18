// ============================================================
// ALiSiO PMS — Database Types
// ============================================================

export type CategoryType = 'glamping' | 'resort' | 'camping';

export type BookingStatus =
  | 'draft'
  | 'tentative'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export type BookingSource =
  | 'direct'
  | 'phone'
  | 'whatsapp'
  | 'booking_com'
  | 'airbnb'
  | 'vrbo'
  | 'other_ota'
  | (string & {}); // dynamic sources from booking_sources table

export type CleaningStatus = 'clean' | 'dirty' | 'in_progress';
export type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'blocked';
export type PricingModel = 'standard' | 'derived' | 'obp' | 'los';
export type UserRole = 'owner' | 'director' | 'manager' | 'receptionist' | 'housekeeper' | 'maintenance' | 'accountant';
export type PromotionType = 'mobile' | 'early_bird' | 'last_minute' | 'long_stay' | 'coupon_code';

// ─── Organization ──────────────────────────────
export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_currency: string;
  created_at: string;
  updated_at: string;
}

// ─── Property ──────────────────────────────────
export interface Property {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  check_in_time: string;
  check_out_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Category ──────────────────────────────────
export interface Category {
  id: string;
  property_id: string;
  name: string;
  type: CategoryType;
  description?: string;
  sort_order: number;
  icon?: string;
  color?: string;
  created_at: string;
}

// ─── Building / SubGroup ───────────────────────
export interface Building {
  id: string;
  category_id: string;
  property_id: string;
  name: string;
  code: string;
  description?: string;
  sort_order: number;
  created_at: string;
}

// ─── Unit Type ─────────────────────────────────
export interface UnitType {
  id: string;
  property_id: string;
  category_id: string;
  building_id?: string;
  name: string;
  code: string;
  description?: string;
  max_adults: number;
  max_children: number;
  max_occupancy: number;
  base_occupancy: number;
  beds_single: number;
  beds_double: number;
  beds_sofa: number;
  extra_bed_available: boolean;
  amenities?: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Unit ──────────────────────────────────────
export interface Unit {
  id: string;
  unit_type_id: string;
  property_id: string;
  category_id: string;
  building_id?: string;
  name: string;
  code: string;
  floor?: number;
  zone?: string;
  beds: number;
  room_status: RoomStatus;
  cleaning_status: CleaningStatus;
  notes?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  unit_type?: UnitType;
  category?: Category;
  building?: Building;
}

// ─── Rate Plan ─────────────────────────────────
export interface RatePlan {
  id: string;
  property_id: string;
  name: string;
  code: string;
  pricing_model: PricingModel;
  currency: string;
  is_active: boolean;
  cancellation_policy?: string;
  meal_plan?: string;
  priority: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

// ─── Rate Plan ↔ Unit Type Link ────────────────
export interface RatePlanUnitType {
  id: string;
  rate_plan_id: string;
  unit_type_id: string;
  is_active: boolean;
  created_at: string;
}

// ─── Price Calendar ────────────────────────────
export interface PriceCalendar {
  id: string;
  unit_type_id: string;
  date: string;
  base_price: number;
  weekend_price?: number;
  min_stay?: number;
  max_stay?: number;
  closed: boolean;
  cta: boolean; // closed to arrival
  ctd: boolean; // closed to departure
  created_at: string;
  updated_at: string;
}

// ─── Occupancy Rule ────────────────────────────
export interface OccupancyRule {
  id: string;
  rate_plan_unit_type_id: string;
  guest_count: number;
  modifier_type: 'percentage' | 'fixed';
  modifier_value: number;
  is_absolute_price: boolean;
  absolute_price?: number;
  created_at: string;
}

// ─── Child Pricing Rule ────────────────────────
export interface ChildPricingRule {
  id: string;
  rate_plan_unit_type_id: string;
  age_from: number;
  age_to: number;
  rule_type: 'free' | 'fixed' | 'percentage' | 'count_as_adult';
  value: number;
  label: string;
  sort_order: number;
  created_at: string;
}

// ─── Restriction ───────────────────────────────
export interface Restriction {
  id: string;
  rate_plan_unit_type_id: string;
  date_from: string;
  date_to: string;
  min_stay?: number;
  max_stay?: number;
  min_advance_days?: number;
  max_advance_days?: number;
  closed: boolean;
  cta: boolean;
  ctd: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Promotion ─────────────────────────────────
export interface Promotion {
  id: string;
  property_id: string;
  name: string;
  type: PromotionType;
  discount_type: 'percentage' | 'fixed';
  offer_amount: number;
  date_from?: string;
  date_to?: string;
  min_nights?: number;
  max_nights?: number;
  coupon_code?: string;
  usage_limit?: number;
  usage_count: number;
  is_stackable: boolean;
  priority: number;
  is_active: boolean;
  channels?: string[];
  created_at: string;
  updated_at: string;
}

// ─── Fee / Tax ─────────────────────────────────
export interface FeeTax {
  id: string;
  property_id: string;
  name: string;
  type: 'per_night' | 'per_stay' | 'per_person' | 'per_person_per_night' | 'percentage';
  amount: number;
  is_included_in_price: boolean;
  is_active: boolean;
  created_at: string;
}

// ─── Reservation ───────────────────────────────
export interface Reservation {
  id: string;
  property_id: string;
  unit_id: string;
  guest_id: string;
  rate_plan_id?: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  children_ages?: number[];
  status: BookingStatus;
  payment_status: 'unpaid' | 'payment_requested' | 'prepaid' | 'paid';
  source: BookingSource;
  total_price: number;
  currency: string;
  commission_amount?: number;
  group_id?: string;
  guest_page_token?: string;
  external_uid?: string;
  bcom_reservation_id?: string;
  price_per_night_json?: string;
  smoking_preference?: string;
  promotions_applied?: string;
  rate_rewriting_info?: string;
  cancellation_policy?: string;
  meal_plan?: string;
  price_breakdown?: PriceBreakdownLine[];
  notes?: string;
  internal_notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  guest?: Guest;
  unit?: Unit;
}

// ─── Price Breakdown ───────────────────────────
export interface PriceBreakdownLine {
  label: string;
  type: 'base' | 'occupancy' | 'child' | 'fee' | 'tax' | 'promotion' | 'discount';
  amount: number;
  details?: string;
}

// ─── Guest ─────────────────────────────────────
export interface Guest {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  document_type?: string;
  document_number?: string;
  date_of_birth?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ─── Payment ───────────────────────────────────
export interface Payment {
  id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  method: 'cash' | 'card' | 'bank_transfer' | 'invoice' | 'online';
  type: 'deposit' | 'full' | 'partial' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paid_at?: string;
  notes?: string;
  created_at: string;
}

// ─── Availability Block ────────────────────────
export interface AvailabilityBlock {
  id: string;
  unit_id: string;
  date_from: string;
  date_to: string;
  reason: 'maintenance' | 'owner_stay' | 'other';
  notes?: string;
  created_at: string;
}

// ─── User ──────────────────────────────────────
export interface User {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  password_hash?: string;
  avatar_url?: string;
  property_ids?: string[];
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

// ─── Audit Log ─────────────────────────────────
export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

// ─── Document Template ─────────────────────────
export interface DocumentTemplate {
  id: string;
  property_id: string;
  name: string;
  type: 'booking_confirmation' | 'invoice' | 'instructions' | 'rules';
  language: string;
  content: string;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
