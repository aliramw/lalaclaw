import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFilePreviewHandlers } = require("../server/routes/file-preview");
const XLSX = require("xlsx");

describe("createFilePreviewHandlers", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    vi.restoreAllMocks();
  });

  it("returns spreadsheet previews for xls and xlsm files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lalaclaw-preview-route-"));
    const xlsPath = path.join(tempDir, "report.xls");
    const xlsmPath = path.join(tempDir, "report.xlsm");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([["name", "score"], ["alice", 95], ["bob", 88]]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");
    await fs.writeFile(xlsPath, XLSX.write(workbook, { type: "buffer", bookType: "xls" }));
    await fs.writeFile(xlsmPath, XLSX.write(workbook, { type: "buffer", bookType: "xlsm" }));

    const sendJson = vi.fn();
    const { handleFilePreview } = createFilePreviewHandlers({
      sendFile: vi.fn(),
      sendJson,
    });

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(xlsPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(xlsmPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    expect(sendJson).toHaveBeenNthCalledWith(
      1,
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: xlsPath,
        name: "report.xls",
        kind: "spreadsheet",
        spreadsheet: expect.objectContaining({
          sheetName: "Summary",
          totalRows: 3,
          totalColumns: 2,
        }),
      }),
    );
    expect(sendJson).toHaveBeenNthCalledWith(
      2,
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: xlsmPath,
        name: "report.xlsm",
        kind: "spreadsheet",
        spreadsheet: expect.objectContaining({
          sheetName: "Summary",
          totalRows: 3,
          totalColumns: 2,
        }),
      }),
    );
  });

  it("returns a pdf preview for pptx files and a raw docx preview payload for docx files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lalaclaw-preview-route-"));
    const pptxPath = path.join(tempDir, "deck.pptx");
    const docxPath = path.join(tempDir, "notes.docx");
    const pdfPath = path.join(tempDir, "deck.pdf");
    await fs.writeFile(pptxPath, "fake pptx");
    await fs.writeFile(docxPath, "fake docx");
    await fs.writeFile(pdfPath, "%PDF-1.4");

    const sendJson = vi.fn();
    const convertOfficeDocumentToPdf = vi.fn(() => pdfPath);
    const { handleFilePreview } = createFilePreviewHandlers({
      sendFile: vi.fn(),
      sendJson,
      convertOfficeDocumentToPdf,
    });

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(pptxPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(docxPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    expect(convertOfficeDocumentToPdf).toHaveBeenCalledTimes(1);
    expect(convertOfficeDocumentToPdf).toHaveBeenNthCalledWith(1, pptxPath);
    expect(sendJson).toHaveBeenNthCalledWith(
      1,
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: pptxPath,
        name: "deck.pptx",
        kind: "pdf",
        sourceKind: "presentation",
        mimeType: "application/pdf",
        contentUrl: `/api/file-preview/content?path=${encodeURIComponent(pdfPath)}`,
      }),
    );
    expect(sendJson).toHaveBeenNthCalledWith(
      2,
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: docxPath,
        name: "notes.docx",
        kind: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contentUrl: `/api/file-preview/content?path=${encodeURIComponent(docxPath)}`,
      }),
    );
  });

  it("returns an image preview payload for heic files after conversion", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lalaclaw-preview-route-"));
    const heicPath = path.join(tempDir, "photo.heic");
    const pngPath = path.join(tempDir, "photo.png");
    await fs.writeFile(heicPath, "fake heic");
    await fs.writeFile(pngPath, "fake png");

    const sendJson = vi.fn();
    const convertHeicImageToPreview = vi.fn(() => pngPath);
    const { handleFilePreview } = createFilePreviewHandlers({
      sendFile: vi.fn(),
      sendJson,
      convertHeicImageToPreview,
    });

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(heicPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    expect(convertHeicImageToPreview).toHaveBeenCalledWith(heicPath);
    expect(sendJson).toHaveBeenCalledWith(
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: heicPath,
        name: "photo.heic",
        kind: "image",
        mimeType: "image/heic",
        contentUrl: `/api/file-preview/content?path=${encodeURIComponent(pngPath)}`,
      }),
    );
  });

  it("returns a stable error when office conversion is unavailable", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lalaclaw-preview-route-"));
    const pptxPath = path.join(tempDir, "deck.pptx");
    await fs.writeFile(pptxPath, "fake pptx");

    const sendJson = vi.fn();
    const { handleFilePreview } = createFilePreviewHandlers({
      sendFile: vi.fn(),
      sendJson,
      convertOfficeDocumentToPdf: vi.fn(() => {
        const error = new Error("Office preview requires LibreOffice.");
        error.code = "office_preview_requires_libreoffice";
        error.installCommand = "brew install --cask libreoffice";
        throw error;
      }),
    });

    await handleFilePreview(
      {
        url: `/api/file-preview?path=${encodeURIComponent(pptxPath)}`,
        headers: { host: "127.0.0.1:3000" },
      },
      {},
    );

    expect(sendJson).toHaveBeenCalledWith(
      {},
      500,
      expect.objectContaining({
        ok: false,
        error: "Office preview requires LibreOffice.",
        errorCode: "office_preview_requires_libreoffice",
        installCommand: "brew install --cask libreoffice",
      }),
    );
  });
});
