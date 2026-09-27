import React, { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { uploadImage } from '../../lib/mediaUpload';

/**
 * Pick one or more photos and save each to Supabase Storage in up to three
 * widths, exactly as the CMS image picker does (mediaUpload.ts). The form
 * receives each saved address through `onUploaded`, in the order picked.
 */
interface ImageUploadButtonProps {
  onUploaded: (url: string) => void;
  /** Storage folder inside the yalla-media bucket. */
  folder?: string;
  multiple?: boolean;
  label?: string;
  maxWidth?: number;
  id?: string;
  className?: string;
}

export const ImageUploadButton: React.FC<ImageUploadButtonProps> = ({
  onUploaded, folder = 'products', multiple = false, label = 'Upload photo', maxWidth = 1600, id, className = '',
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    setError(null);
    try {
      for (let i = 0; i < picked.length; i++) {
        setProgress(picked.length > 1 ? `Uploading ${i + 1} of ${picked.length}…` : 'Uploading…');
        const { url } = await uploadImage(picked[i], { folder, maxWidth });
        onUploaded(url);
      }
    } catch (err: any) {
      setError(err?.message || 'The photo could not be uploaded.');
    } finally {
      setProgress(null);
      // Picking the same file again must fire another change.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        id={id}
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black disabled:opacity-60 cursor-pointer whitespace-nowrap"
      >
        {progress !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        <span>{progress ?? label}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={e => { void upload(e.target.files); }}
      />
      {error && <span role="alert" className="text-[11px] font-semibold text-rose-700">{error}</span>}
    </span>
  );
};
