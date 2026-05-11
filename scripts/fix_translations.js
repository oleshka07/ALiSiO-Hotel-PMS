const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/ui/translations.ts';
let content = fs.readFileSync(file, 'utf8');

// Add to interface
content = content.replace(
  /  nightsWord: \(n: number\) => string;\n\}/,
  "  nightsWord: (n: number) => string;\n  packagePrefix: string;\n}"
);

// Add to uk
content = content.replace(
  /    nightsWord: \(n: number\) => n === 1 \? 'ніч' : n < 5 \? 'ночі' : 'ночей',\n  \},/,
  "    nightsWord: (n: number) => n === 1 ? 'ніч' : n < 5 ? 'ночі' : 'ночей',\n    packagePrefix: 'Пакет',\n  },"
);

// Add to en
content = content.replace(
  /    nightsWord: \(n: number\) => n === 1 \? 'night' : 'nights',\n  \},/,
  "    nightsWord: (n: number) => n === 1 ? 'night' : 'nights',\n    packagePrefix: 'Package',\n  },"
);

// Add to cs
content = content.replace(
  /    nightsWord: \(n: number\) => n === 1 \? 'noc' : n < 5 \? 'noci' : 'nocí',\n  \},/,
  "    nightsWord: (n: number) => n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí',\n    packagePrefix: 'Balíček',\n  },"
);

// Add to de
content = content.replace(
  /    nightsWord: \(n: number\) => n === 1 \? 'Nacht' : 'Nächte',\n  \},/,
  "    nightsWord: (n: number) => n === 1 ? 'Nacht' : 'Nächte',\n    packagePrefix: 'Paket',\n  },"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated translations.ts');
