const http = require('http');

function testEndpoint(month) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/guest-registry?month=${month}`,
      headers: { 'Cookie': 'session_id=test' }
    };
    const req = http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          console.log(`[${month}] Status: ${res.statusCode}, Entries: ${j.entries?.length ?? 'N/A'}, Error: ${j.error || 'none'}`);
          if (j.entries?.length > 0) {
            console.log(`  First: ${j.entries[0].first_name} ${j.entries[0].last_name}`);
          }
        } catch(e) {
          console.log(`[${month}] Status: ${res.statusCode}, Raw: ${data.substring(0, 200)}`);
        }
        resolve();
      });
    });
    req.on('error', (e) => { console.error(`[${month}] Error:`, e.message); resolve(); });
  });
}

async function main() {
  await testEndpoint('2026-03');
  await testEndpoint('2026-04');
  await testEndpoint('2026-05');
  await testEndpoint('2026-06');
}

main();
