const Tesseract = require('tesseract.js');

async function main() {
  // Read from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  
  const imagePathOrBase64 = input.trim();
  if (!imagePathOrBase64) {
    console.error(JSON.stringify({ success: false, error: 'No image provided via stdin' }));
    process.exit(1);
  }

  try {
    const result = await Tesseract.recognize(imagePathOrBase64, 'eng', {
      logger: m => {}
    });
    console.log(JSON.stringify({ success: true, text: result.data.text }));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ success: false, error: error.message }));
    process.exit(1);
  }
}

main();
