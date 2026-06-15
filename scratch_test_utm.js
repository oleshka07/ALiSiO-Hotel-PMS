const fs = require('fs');
const sqlite3 = require('better-sqlite3');
const db = new sqlite3('c:/Projects/web dev/_shared/ALiSiO-Hotel-PMS/data/alisio.db');
const siteId = '2975fba30e3cd3a6f7df3092183e258a';

const getReservations = () => {
    return db.prepare(`
        SELECT id, source, utm_source, utm_campaign, widget_session_id 
        FROM reservations 
        ORDER BY created_at DESC LIMIT 1
    `).get();
};
console.log('Last Reservation Before:', getReservations());

fetch('http://localhost:3000/api/booking/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        siteId: siteId,
        unitId: 'u_mr2',
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
        firstName: 'TestUTM',
        lastName: 'User',
        phone: '+420 111 222 333',
        email: 'utm@example.com',
        utmParams: {
            utm_source: 'google',
            utm_medium: 'cpc',
            utm_campaign: 'summer_promo'
        },
        widgetSessionId: 'test-session-utm-123'
    })
})
.then(r => r.json())
.then(data => {
    console.log('Reservation response:', data);
    setTimeout(() => {
        console.log('Last Reservation After:', getReservations());
    }, 500);
});
