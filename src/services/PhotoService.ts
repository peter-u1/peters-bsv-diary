import type { EntryPhoto } from "../types/Entry";

const STANDARD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const HEIC_IMAGE_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;
const TARGET_SIZE = 220 * 1024;

class PhotoService {
  async prepare(file: File): Promise<EntryPhoto> {
    if (file.size > MAX_ORIGINAL_SIZE) {
      throw new Error(
        "Das ursprüngliche Foto darf maximal 25 MB groß sein."
      );
    }

    // HEIC-Unterstützung ist groß (mehrere MB) und wird erst geladen,
    // wenn wirklich ein Foto ausgewählt wird.
    const { heicTo, isHeic } = await import("heic-to");

    const heicByName = /\.(heic|heif)$/i.test(file.name);
    const heicByType = HEIC_IMAGE_TYPES.has(file.type);

    let heicByContent = false;

    try {
      heicByContent = await isHeic(file);
    } catch (error) {
      console.warn(
        "HEIC-Erkennung anhand der Datei war nicht möglich:",
        error
      );
    }

    const isHeicFile =
      heicByName || heicByType || heicByContent;

    if (
      !isHeicFile &&
      !STANDARD_IMAGE_TYPES.has(file.type)
    ) {
      throw new Error(
        "Bitte ein JPG-, PNG-, WebP-, HEIC- oder HEIF-Foto auswählen."
      );
    }

    let sourceBlob: Blob = file;

    if (isHeicFile) {
      try {
        const converted = await heicTo({
          blob: file,
          type: "image/jpeg",
          quality: 0.92,
        });

        if (!(converted instanceof Blob)) {
          throw new Error(
            "Die HEIC-Konvertierung lieferte kein gültiges Bild."
          );
        }

        sourceBlob = converted;
      } catch (error) {
        console.error(
          "HEIC-Konvertierung fehlgeschlagen:",
          error
        );

        throw new Error(
          "Das HEIC-Foto konnte nicht in JPEG umgewandelt werden."
        );
      }
    }

    const image = await this.loadImage(sourceBlob);

    const maximumDimensions = [1280, 1024, 800, 640];
    const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];

    for (const maximumDimension of maximumDimensions) {
      const largestSide = Math.max(
        image.naturalWidth,
        image.naturalHeight
      );

      const scale = Math.min(
        1,
        maximumDimension / largestSide
      );

      const width = Math.max(
        1,
        Math.round(image.naturalWidth * scale)
      );

      const height = Math.max(
        1,
        Math.round(image.naturalHeight * scale)
      );

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Das Foto konnte nicht verarbeitet werden."
        );
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL(
          "image/jpeg",
          quality
        );

        if (
          this.getDataUrlSize(dataUrl) <=
          TARGET_SIZE
        ) {
          return {
            name: this.createJpegName(file.name),
            mimeType: "image/jpeg",
            dataUrl,
          };
        }
      }
    }

    throw new Error(
      "Das Foto konnte nicht ausreichend verkleinert werden."
    );
  }

  private loadImage(
    blob: Blob
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);

        if (
          image.naturalWidth === 0 ||
          image.naturalHeight === 0
        ) {
          reject(
            new Error(
              "Das Foto enthält keine gültigen Bilddaten."
            )
          );

          return;
        }

        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);

        reject(
          new Error(
            "Das umgewandelte Foto konnte nicht geöffnet werden."
          )
        );
      };

      image.src = objectUrl;
    });
  }

  private getDataUrlSize(
    dataUrl: string
  ): number {
    const base64 = dataUrl.split(",")[1] ?? "";

    const padding = base64.endsWith("==")
      ? 2
      : base64.endsWith("=")
        ? 1
        : 0;

    return (
      Math.ceil((base64.length * 3) / 4) -
      padding
    );
  }

  private createJpegName(
    originalName: string
  ): string {
    const baseName =
      originalName.replace(/\.[^.]+$/, "") ||
      "foto";

    return `${baseName}.jpg`;
  }
}

export default new PhotoService();