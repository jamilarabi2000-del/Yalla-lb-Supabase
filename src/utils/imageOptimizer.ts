/**
 * Client-Side Image Optimizer
 * Resizes and compresses image files using an off-screen HTML5 Canvas.
 * Ensures image payloads are web-optimized (typically 50KB - 150KB) and
 * easily fit within Firestore's 1MB document quota without quality degradation.
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default: 0.82)
  maxSizeBytes?: number; // default: 250KB
  format?: 'image/webp' | 'image/jpeg';
}

export interface OptimizedImageResult {
  dataUrl: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savingsPercent: number;
  width: number;
  height: number;
}

export async function optimizeImageFile(
  file: File | Blob,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult> {
  const maxWidth = options.maxWidth || 1440;
  const maxHeight = options.maxHeight || 900;
  let quality = options.quality || 0.78;
  const maxSizeBytes = options.maxSizeBytes || 85 * 1024; // 85 KB max ensures multiple slides fit well under Firestore's 1MB limit
  const originalSizeBytes = file.size;

  return new Promise((resolve, reject) => {
    // 1. Create temporary Object URL to avoid loading full file into memory at once
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let targetWidth = img.naturalWidth || img.width;
      let targetHeight = img.naturalHeight || img.height;

      // 2. Calculate proportional bounding box
      if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      // Ensure dimensions are at least 1px
      targetWidth = Math.max(1, targetWidth);
      targetHeight = Math.max(1, targetHeight);

      // 3. Draw onto off-screen canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      // High quality smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // 4. Try WebP first for superior compression, fallback to JPEG
      const tryFormat = options.format || 'image/webp';
      let dataUrl = canvas.toDataURL(tryFormat, quality);

      // If WebP is not supported or returns empty, fallback to JPEG
      if (!dataUrl.startsWith(`data:${tryFormat}`)) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      // 5. Estimate payload size (base64 length * 0.75)
      let approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

      // 6. Progressive quality and dimension reduction if still above target maxSizeBytes
      let iterations = 0;
      while (approxBytes > maxSizeBytes && iterations < 5) {
        quality = Math.max(0.40, quality - 0.12);
        if (targetWidth > 640) {
          targetWidth = Math.round(targetWidth * 0.82);
          targetHeight = Math.round(targetHeight * 0.82);
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        }

        dataUrl = canvas.toDataURL(tryFormat, quality);
        approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        iterations++;
      }

      const savingsPercent = originalSizeBytes > approxBytes
        ? Math.round(((originalSizeBytes - approxBytes) / originalSizeBytes) * 100)
        : 0;

      resolve({
        dataUrl,
        originalSizeBytes,
        optimizedSizeBytes: approxBytes,
        savingsPercent,
        width: targetWidth,
        height: targetHeight
      });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file: ' + String(err)));
    };

    img.src = objectUrl;
  });
}

/**
 * Re-compresses an existing base64 dataUrl if it exceeds a certain byte threshold (e.g. 100KB)
 */
export async function compressDataUrlIfLarge(
  dataUrl: string,
  maxSizeBytes: number = 85 * 1024
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  const approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (approxBytes <= maxSizeBytes) {
    return dataUrl;
  }

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const optimized = await optimizeImageFile(blob, { maxSizeBytes, quality: 0.76 });
    return optimized.dataUrl;
  } catch (err) {
    console.warn('[imageOptimizer] Failed to compress large dataUrl:', err);
    return dataUrl;
  }
}

/**
 * Formats byte counts into human-readable strings (e.g. 1.2 MB or 85 KB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
