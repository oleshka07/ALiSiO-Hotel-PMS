'use client';

import React from 'react';

export type AccommodationType = 'glamping' | 'buildings' | 'camping';

interface Props {
  onSelect: (type: AccommodationType) => void;
}

const TYPES: { type: AccommodationType; emoji: string; name: string; desc: string; price: string }[] = [
  { type: 'camping', emoji: '⛺', name: 'Camping', desc: 'Tent, caravan, motorhome', price: 'from 100 Kč / night' },
  // { type: 'glamping', emoji: '🌲', name: 'Glamping Houses', desc: 'Tiny House or Barn House', price: 'from 3 900 Kč / night' },
  { type: 'buildings', emoji: '🏠', name: 'Buildings (Groups)', desc: 'Budova D or Budova F', price: 'from 390 Kč / bed / night' },
];

export default function StepLanding({ onSelect }: Props) {
  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Where would you like to stay?</h1>
      <p className="kc-subtitle">Choose your accommodation type to get started</p>

      {TYPES.map(t => (
        <div key={t.type} className="kc-card kc-card-clickable" onClick={() => onSelect(t.type)}>
          <div className="kc-card-body">
            <div className="kc-card-emoji">{t.emoji}</div>
            <div className="kc-card-name">{t.name}</div>
            <div className="kc-card-desc">{t.desc}</div>
            <div className="kc-card-price">{t.price}</div>
            <div className="kc-card-arrow">→</div>
          </div>
        </div>
      ))}

      <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-help-link">
        💬 Need help? Chat with us →
      </a>
    </div>
  );
}
