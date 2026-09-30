import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";

const maxPhotos = 3;
const maxInputBytes = 20 * 1024 * 1024;
const maxOutputBytes = 200 * 1024;
const maxDimension = 1600;

function compressPhoto(file: File): Promise<File> {
  return createImageBitmap(file).then(
    (bitmap) =>
      new Promise<File>((resolve, reject) => {
        const baseScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const qualities = [0.8, 0.65, 0.5, 0.35, 0.25];
        const scales = [1, 0.8, 0.65, 0.5];
        void (async () => {
          try {
            for (const reduction of scales) {
              const scale = baseScale * reduction;
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(bitmap.width * scale));
              canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Photo compression is not available in this browser.");
              context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              for (const quality of qualities) {
                const blob = await new Promise<Blob | null>((resolveBlob) =>
                  canvas.toBlob(resolveBlob, "image/jpeg", quality),
                );
                if (!blob) throw new Error("This photo could not be compressed.");
                if (blob.size <= maxOutputBytes) {
                  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
                  resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
                  return;
                }
              }
            }
            throw new Error(`${file.name} could not be compressed below 200 KB.`);
          } catch (error) {
            reject(error);
          } finally {
            bitmap.close();
          }
        })();
      }),
  );
}

interface PhotoUploadProps {
  files: File[];
  error: string;
  onFilesChange: (files: File[]) => void;
  onErrorChange: (error: string) => void;
}

export function PhotoUpload({ files, error, onFilesChange, onErrorChange }: PhotoUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  async function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    onErrorChange("");
    setProcessing(true);
    try {
      const incoming = Array.from(fileList);
      const accepted: File[] = [];
      for (const file of incoming) {
        if (!file.type.startsWith("image/")) {
          onErrorChange(`${file.name} is not an image.`);
          continue;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          onErrorChange(`${file.name} must be a JPEG, PNG, or WebP image.`);
          continue;
        }
        if (file.size > maxInputBytes) {
          onErrorChange(`${file.name} is over the 20 MB upload limit.`);
          continue;
        }
        try {
          accepted.push(await compressPhoto(file));
        } catch (cause) {
          onErrorChange(
            cause instanceof Error ? cause.message : `${file.name} could not be processed.`,
          );
        }
      }
      const available = maxPhotos - files.length;
      if (accepted.length > available) {
        onErrorChange(`You can attach up to ${maxPhotos} photos.`);
      }
      onFilesChange([...files, ...accepted.slice(0, Math.max(0, available))]);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="m-0 text-sm font-semibold text-white">
          Photos <span className="font-normal text-slate-400">(optional, up to 3)</span>
        </h3>
        <p className="mb-0 mt-1 text-xs text-slate-400">
          Photos are compressed to 200 KB each before upload. JPEG, PNG, or WebP, up to 20 MB each.
        </p>
      </div>
      <label className="flex min-h-12 w-fit cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm text-slate-100 hover:bg-white/[0.08] focus-within:outline focus-within:outline-2 focus-within:outline-cyan-300">
        <ImagePlus size={17} aria-hidden="true" />
        {processing ? "Preparing photos…" : "Add photos"}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          aria-label="Add up to 3 report photos"
          disabled={processing || files.length >= maxPhotos}
          onChange={(event) => {
            void addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <span className="min-h-4 text-xs text-slate-300" role="status">
        {processing ? "Compressing photos before upload…" : ""}
      </span>
      {error && (
        <p className="m-0 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((file, index) => (
            <div className="relative" key={`${file.name}-${index}`}>
              <img
                className="h-20 w-20 rounded-lg border border-white/15 object-cover"
                src={previews[index]}
                alt={`Report attachment ${index + 1}`}
              />
              <button
                type="button"
                className="absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))}
                aria-label={`Remove photo ${index + 1}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
