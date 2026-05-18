const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/ui/BookingV2.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add 'packagePrefix' to uk
content = content.replace(
  /connectionError: "Помилка підключення"\n\s*\},/g,
  `connectionError: "Помилка підключення",\n    packagePrefix: "Пакет"\n  },`
);

// 2. Add 'packagePrefix' to en
content = content.replace(
  /connectionError: "Connection error"\n\s*\},/g,
  `connectionError: "Connection error",\n    packagePrefix: "Package"\n  },`
);

// 3. Add 'packagePrefix' to cs
content = content.replace(
  /connectionError: "Chyba připojení"\n\s*\},/g,
  `connectionError: "Chyba připojení",\n    packagePrefix: "Balíček"\n  },`
);

// 4. Add 'packagePrefix' to de
content = content.replace(
  /connectionError: "Verbindungsfehler"\n\s*\}/g,
  `connectionError: "Verbindungsfehler",\n    packagePrefix: "Paket"\n  }`
);

// 5. Update the line using it
content = content.replace(
  /`Пакет — \$\{offerApplied\.description \|\| offerApplied\.code\}`/g,
  "`${t.packagePrefix} — ${offerApplied.description || offerApplied.code}`"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated BookingV2.tsx with localized package string');
