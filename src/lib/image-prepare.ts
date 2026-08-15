export type PrepareJpegOptions = {
  maxEdge: number;
  maxBytes: number;
  square?: boolean;
};

export async function prepareJpegImage(
  file: File,
  options: PrepareJpegOptions,
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  if (!file || file.size <= 0) {
    return { ok: false, message: "Choose a photo to upload." };
  }
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, message: "That photo is too large. Try a smaller JPEG or PNG." };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "Use a JPEG, PNG, or WebP photo." };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { ok: false, message: "Could not prepare that photo. Please try again." };
  }

  if (options.square) {
    const source = Math.min(bitmap.width, bitmap.height);
    const dest = Math.max(1, Math.min(options.maxEdge, source));
    const sx = Math.floor((bitmap.width - source) / 2);
    const sy = Math.floor((bitmap.height - source) / 2);
    canvas.width = dest;
    canvas.height = dest;
    ctx.drawImage(bitmap, sx, sy, source, source, 0, 0, dest, dest);
  } else {
    const scale = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close();

  const qualities = [0.82, 0.7, 0.55];
  for (const quality of qualities) {
    const blob = await canvasToJpeg(canvas, quality);
    if (blob && blob.size <= options.maxBytes) {
      return { ok: true, blob };
    }
  }
  return { ok: false, message: "That photo is too large. Try a smaller JPEG or PNG." };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}
