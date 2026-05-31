import React from 'react';
import { createRoot } from 'react-dom/client';
import BookingV2 from './BookingV2';

interface WidgetConfig {
  target: HTMLElement;
  siteSlug: string;
  lang?: any;
  thankYouUrl?: string;
}

const AlisioBookingWidget = {
  init(config: WidgetConfig) {
    if (!config.target) {
      console.error('ALiSiO Booking Widget: Target container is missing.');
      return;
    }
    const root = createRoot(config.target);
    root.render(
      <BookingV2
        siteSlug={config.siteSlug}
        lang={config.lang}
        thankYouUrl={config.thankYouUrl}
      />
    );
  }
};

if (typeof window !== 'undefined') {
  (window as any).AlisioBookingWidget = AlisioBookingWidget;
}

export default AlisioBookingWidget;
