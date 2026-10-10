import sharp from 'sharp';
export function normalizeCover(bytes) {
  return sharp(bytes, { limitInputPixels: 25000000 })
    .resize(1200, 1800, { fit: 'cover' })
    .png()
    .toBuffer();
}
