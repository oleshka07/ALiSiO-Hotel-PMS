const esbuild = require('esbuild');
const path = require('path');

async function build() {
  try {
    console.log('Compiling ALiSiO Booking Widget...');
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/modules/bookings/ui/BookingWidgetEmbed.tsx')],
      bundle: true,
      minify: true,
      sourcemap: false,
      outfile: path.join(__dirname, '../public/widget/native-bundle.js'),
      loader: {
        '.png': 'dataurl',
        '.svg': 'dataurl',
        '.css': 'css',
      },
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });
    console.log('Compilation completed successfully!');
  } catch (error) {
    console.error('Compilation failed:', error);
    process.exit(1);
  }
}

build();
