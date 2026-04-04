import "../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { extractImageFilesFromDataTransfer } from "../messageInputAttachments";

const toFileList = (files: File[]): FileList => files as unknown as FileList;

const toItemList = (files: File[]): DataTransferItemList =>
  files.map((file) => ({
    kind: "file",
    type: file.type,
    getAsFile: () => file,
  })) as unknown as DataTransferItemList;

const createTransfer = (files: File[]): Pick<DataTransfer, "files" | "items"> => ({
  files: toFileList(files),
  items: toItemList(files),
});

describe("extractImageFilesFromDataTransfer", () => {
  it("returns only image files from transfer items", () => {
    const image = new File(["image"], "cat.png", { type: "image/png", lastModified: 1 });
    const text = new File(["text"], "note.txt", { type: "text/plain", lastModified: 2 });

    const result = extractImageFilesFromDataTransfer(createTransfer([image, text]));

    expect(result).toEqual([image]);
  });

  it("deduplicates repeated images", () => {
    const image = new File(["image"], "cat.png", { type: "image/png", lastModified: 1 });

    const result = extractImageFilesFromDataTransfer(createTransfer([image, image]));

    expect(result).toEqual([image]);
  });

  it("falls back to files when items are unavailable", () => {
    const image = new File(["image"], "cat.png", { type: "image/png", lastModified: 1 });
    const text = new File(["text"], "note.txt", { type: "text/plain", lastModified: 2 });

    const result = extractImageFilesFromDataTransfer({
      files: toFileList([image, text]),
      items: toItemList([]),
    });

    expect(result).toEqual([image]);
  });
});
