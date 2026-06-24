export interface Site {
  id: string;
  name: string;
  slug: string;
  site_url?: string;
  type: string;
  currency: string;
  status: string;
  design_config: DesignConfig;
  widget_config: WidgetConfig;
  payment_config: PaymentConfig;
}

export interface PaymentConfig {
  provider?: 'teya' | 'stripe' | 'manual';
  enabled?: boolean;
  teya?: {
    client_id?: string;
    client_secret?: string;
    store_id?: string;
  };
}

export interface DesignConfig {
  theme?: string;
  primary_color?: string;
  button_style?: string;
  show_shadow?: boolean;
  logo_url?: string | null;
  favicon_url?: string | null;
}

export interface WidgetConfig {
  search_result_url?: string;
  enable_prefill?: boolean;
  default_lang?: string;
  supportContact?: string;
  site_url?: string;
  thank_you_url?: string;
  email_received_subject?: string;
  email_received_body?: string;
  email_confirmed_subject?: string;
  email_confirmed_body?: string;
  email_unpaid_subject?: string;
  email_unpaid_body?: string;
  // Analytics — stored in widget_config JSON, no DB migration needed
  fb_pixel_id?: string;
  ga4_id?: string;
  tiktok_pixel_id?: string;
  return_url?: string;
}

export interface Listing {
  id: string;
  unit_id?: string;
  unit_type_id?: string;
  unit_name?: string;
  unit_code?: string;
  unit_type_name?: string;
  unit_type_code?: string;
  unit_type_photos?: string;
  photos?: string;
  actual_unit_type_id?: string;
  price_override?: number;
  external_url?: string;
  thank_you_url?: string;
  default_lang?: string;
  sort_order: number;
  created_at: string;
}

export interface SiteService {
  id: string;
  name: string;
  icon: string;
  service_type: string;
  price: number;
  currency: string;
  is_enabled: number;
  price_override?: number;
  photo_override?: string;
  site_service_id?: string;
}

export interface RatePlan {
  id: string;
  name: string;
  is_default: number;
  cancellation_policy: string;
  payment_schedule: { percent: number; trigger: string }[];
  meals_included: string[];
  min_stay: number;
  max_stay: number;
  min_days_before_checkin: number;
  same_day_cutoff_hour?: number | null;
  pricing_mode: string;
  pricing_modifier_percent?: number | null;
  pricing_modifier_type?: string | null;
  derived_from_plan_id?: string | null;
  valid_weekdays?: string[] | null;
  applied_listings: string[];
}
