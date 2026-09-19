import { supabase } from '../lib/supabase';

const BUCKET = 'yalla-media';

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/avif': return 'avif';
    default: return 'webp';
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'media';
}

export async function uploadImageToSupabase(
  source: File | Blob | string,
  folder = 'products'
): Promise<string> {
  let file: File | Blob = source as File | Blob;

  if (typeof source === 'string') {
    if (!source.startsWith('data:image/')) {
      throw new Error('Only optimized data:image URLs can be uploaded by this helper.');
    }
    const response = await fetch(source);
    file = await response.blob();
  }

  const mime = file.type || 'image/webp';
  if (!mime.startsWith('image/')) {
    throw new Error('The selected file is not an image.');
  }

  const path = `${safeSegment(folder)}/${crypto.randomUUID()}.${extensionForMime(mime)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: mime,
      upsert: false
    });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    throw new Error('Image uploaded but no public URL was returned.');
  }

  return data.publicUrl;
}
