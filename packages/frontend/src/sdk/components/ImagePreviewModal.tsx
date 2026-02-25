import { X } from "lucide-react";
import { type MouseEvent, useEffect } from "react";

export interface ImagePreviewModalProps {
  image: {
    url: string;
    name: string;
  } | null;
  onClose: () => void;
}

export function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps): JSX.Element | null {
  useEffect(() => {
    if (!image) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [image, onClose]);

  if (!image) {
    return null;
  }

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col items-center"
        onClick={stopPropagation}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/60 text-white hover:bg-black/80"
          aria-label="关闭图片预览"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={image.url}
          alt={image.name}
          className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl"
        />
        <div className="mt-2 text-xs text-white/90 bg-black/40 px-3 py-1 rounded-full max-w-full truncate">
          {image.name}
        </div>
      </div>
    </div>
  );
}

export default ImagePreviewModal;
