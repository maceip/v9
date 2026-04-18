const ASCII_RAMP = " .,:;i1tfLCG08@";
const INPUT_ASSET_PATH = '/web/assets/bountynet_input.svg';

function terminalSize() {
  const columns = Number(globalThis.process?.stdout?.columns || 80);
  const rows = Number(globalThis.process?.stdout?.rows || 28);
  const width = Math.max(28, Math.min(78, columns - 4));
  const height = Math.max(16, Math.min(30, rows - 10));
  return { width, height };
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
    const source = new URL(INPUT_ASSET_PATH, globalThis.location?.origin || window.location.origin).href;
    const image = await loadImage(source);
    const ascii = renderAscii(image, width, height);

    console.log('\x1b[32mimage-to-ascii demo\x1b[0m');
    console.log('Inspired by IonicaBizau/image-to-ascii, rendered in the browser runtime.');
    console.log(`Source image: ${INPUT_ASSET_PATH} | Output grid: ${width}x${height}`);
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
