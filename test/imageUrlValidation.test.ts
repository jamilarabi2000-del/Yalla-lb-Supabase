import { describe, expect, it } from 'vitest';
import { validateExternalImageUrl } from '../src/lib/imageUrlValidation';

describe('validateExternalImageUrl', () => {
  it('accepts extensionless Unsplash CDN URLs with query parameters', () => {
    const result = validateExternalImageUrl('https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=800', true);
    expect(result.valid).toBe(true);
  });

  it('accepts normal HTTPS image URLs without requiring an extension', () => {
    expect(validateExternalImageUrl('https://cdn.example.com/image?id=123', true).valid).toBe(true);
  });

  it('rejects non-HTTPS URLs', () => {
    expect(validateExternalImageUrl('http://cdn.example.com/image.jpg', true).valid).toBe(false);
  });

  it('rejects HTML page URLs', () => {
    expect(validateExternalImageUrl('https://example.com/product.html', true).valid).toBe(false);
  });

  it('rejects malformed and empty required URLs', () => {
    expect(validateExternalImageUrl('not-a-url', true).valid).toBe(false);
    expect(validateExternalImageUrl('', true).valid).toBe(false);
  });
});
