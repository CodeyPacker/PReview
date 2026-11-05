import { MAX_SCREENSHOT_BYTES } from '../../shared/contracts/review-findings.ts';

// Large enough to read text. Claude scales down anything bigger.
const MAX_EDGE = 2000;

// Converts an image file to a WebP data URL, scaled down if needed, so every saved screenshot
// is one type and small enough for Claude to read.
export async function screenshotDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the image.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  if (blob.size > MAX_SCREENSHOT_BYTES) throw new Error('The image is too large.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}
