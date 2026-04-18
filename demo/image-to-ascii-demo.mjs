const ASCII_RAMP = " .,:;i1tfLCG08@";

const SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 192">
  <rect width="256" height="192" rx="18" fill="#0a0a0f"/>
  <rect x="20" y="24" width="216" height="144" rx="14" fill="#11111b" stroke="#2a2b3b" stroke-width="3"/>
  <rect x="36" y="40" width="184" height="24" rx="8" fill="#1d2030"/>
  <circle cx="52" cy="52" r="5" fill="#7aa2f7"/>
  <circle cx="68" cy="52" r="5" fill="#9bff00"/>
  <circle cx="84" cy="52" r="5" fill="#f7768e"/>
  <polygon points="150,74 104,122 136,122 116,160 178,102 146,102" fill="#9bff00"/>
  <rect x="36" y="136" width="72" height="10" rx="5" fill="#7aa2f7" opacity="0.9"/>
  <rect x="36" y="152" width="104" height="8" rx="4" fill="#c0caf5" opacity="0.72"/>
  <rect x="148" y="136" width="52" height="24" rx="8" fill="#1f2335" stroke="#7aa2f7" stroke-width="2"/>
  <text x="174" y="153" text-anchor="middle" font-family="monospace" font-size="13" fill="#c0caf5">v9</text>
</svg>
`.trim();

function terminalSize() {
  const columns = Number(globalThis.process?.stdout?.columns || 80);
  const rows = Number(globalThis.process?.stdout?.rows || 28);
  const width = Math.max(28, Math.min(78, columns - 4));
  const height = Math.max(16, Math.min(30, rows - 10));
  return { width, height };
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load demo image: ${src.slice(0, 64)}`));
    image.src = src;
  });
}

function renderAscii(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }

  context.fillStyle = '#0a0a0f';
  context.fillRect(0, 0, width, height);

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.floor((width - drawWidth) / 2);
  const offsetY = Math.floor((height - drawHeight) / 2);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const { data } = context.getImageData(0, 0, width, height);
  const lines = [];
  for (let y = 0; y < height; y += 1) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = (y * width + x) * 4;
      const alpha = data[pixelOffset + 3] / 255;
      if (alpha < 0.05) {
        line += ' ';
        continue;
      }
      const luminance = (
        data[pixelOffset] * 0.2126
        + data[pixelOffset + 1] * 0.7152
        + data[pixelOffset + 2] * 0.0722
      ) * alpha;
      const rampIndex = Math.max(
        0,
        Math.min(ASCII_RAMP.length - 1, Math.round((luminance / 255) * (ASCII_RAMP.length - 1))),
      );
      line += ASCII_RAMP[rampIndex];
    }
    lines.push(line.replace(/\s+$/u, ''));
  }

  return lines.join('\n');
}

export async function main() {
  try {
    const { width, height } = terminalSize();
    const source = svgDataUrl(SAMPLE_SVG);
    const image = await loadImage(source);
    const ascii = renderAscii(image, width, height);

    console.log('\x1b[32mimage-to-ascii demo\x1b[0m');
    console.log('Inspired by IonicaBizau/image-to-ascii, rendered in the browser runtime.');
    console.log(`Source image: inline SVG sample | Output grid: ${width}x${height}`);
    console.log('');
    console.log(ascii);

    if (globalThis.process) {
      globalThis.process.exitCode = 0;
    }
  } catch (error) {
    console.error(`image-to-ascii demo failed: ${error?.message || error}`);
    if (globalThis.process) {
      globalThis.process.exitCode = 1;
    }
  }
}

export default { main };
