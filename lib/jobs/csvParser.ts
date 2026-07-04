import Papa from "papaparse";
import ExcelJS from "exceljs";

export type CsvRow = {
  number?: string;
  message?: string;
  attachmentUrl?: string;
};

/** Hard cap on uploaded file size (also enforced client-side). */
export const MAX_CSV_BYTES = 3 * 1024 * 1024; // 3 MB

type ColumnKey = "number" | "message" | "attachmentUrl";

/** Maps a raw header cell to one of our known columns (case/space tolerant). */
function matchColumn(raw: string): ColumnKey | null {
  const k = raw.trim().toLowerCase();
  if (k === "number") return "number";
  if (k === "message") return "message";
  if (k === "attachmenturl") return "attachmentUrl";
  return null;
}

/** A row counts only if it has a non-empty `number` value. */
function hasValue(row: CsvRow): boolean {
  return !!row.number && row.number.trim() !== "";
}

/**
 * Parses CSV text into typed rows using a header row. Recognized headers:
 * `number`, `message`, `attachmentUrl` (case/whitespace tolerant).
 *
 * Handles UTF-8 with or without a BOM, and drops empty / whitespace-only rows
 * as well as any row missing a `number` — so trailing blank lines never turn
 * into phantom recipients.
 */
export function parseCsv(text: string): CsvRow[] {
  // Strip a leading UTF-8 BOM so the first header isn't "﻿number".
  const clean = text.replace(/^﻿/, "");

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy", // also drops rows that are only delimiters/spaces
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  return result.data
    .map((row) => {
      const normalized: CsvRow = {};
      for (const [key, value] of Object.entries(row)) {
        const col = matchColumn(key);
        if (!col) continue;
        const v = typeof value === "string" ? value.trim() : value;
        normalized[col] = v as string;
      }
      return normalized;
    })
    .filter(hasValue);
}

/** Coerces any ExcelJS cell value into a plain trimmed string. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString().trim();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Rich text: { richText: [{ text }] }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((t) => t.text ?? "")
        .join("")
        .trim();
    }
    // Hyperlink cell: { text, hyperlink }
    if (typeof o.text === "string") return o.text.trim();
    // Formula cell: { formula, result }
    if (o.result !== undefined) return cellToString(o.result);
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return String(v).trim();
}

/**
 * Parses the first worksheet of an XLSX buffer into typed rows, using the first
 * non-empty row as the header. Empty rows are skipped, and — as with CSV — any
 * row without a `number` is dropped, so the huge blank tail Excel loves to add
 * is ignored.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<CsvRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: CsvRow[] = [];
  let headerMap: Record<number, ColumnKey> | null = null;

  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values is 1-indexed (index 0 is unused) and may be sparse.
    const values = row.values as unknown[];

    if (!headerMap) {
      const map: Record<number, ColumnKey> = {};
      for (let i = 1; i < values.length; i++) {
        const col = matchColumn(cellToString(values[i]));
        if (col) map[i] = col;
      }
      headerMap = map;
      return;
    }

    const rec: CsvRow = {};
    for (let i = 1; i < values.length; i++) {
      const col = headerMap[i];
      if (!col) continue;
      rec[col] = cellToString(values[i]);
    }
    if (hasValue(rec)) rows.push(rec);
  });

  return rows;
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isXlsx(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
}

export type BulkInput = {
  rows: CsvRow[];
  fields: Record<string, string>;
  error: string | null;
};

/**
 * Reads a bulk-send request in either supported format:
 *
 * - `multipart/form-data` with a `file` upload — a `.csv` (UTF-8) or `.xlsx`
 *   spreadsheet — plus optional extra scalar fields (e.g. shared `attachmentUrl`).
 * - `application/json` with `{ recipients: [{ number, message?, attachmentUrl? }] }`
 *   (API-consumer flow), plus optional top-level scalar fields.
 *
 * Both normalize to the same CsvRow[] shape (only rows with a real `number`)
 * so routes and job creation don't care which transport was used.
 */
export async function readBulkRequest(req: Request): Promise<BulkInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: { recipients?: unknown; attachmentUrl?: unknown };
    try {
      body = await req.json();
    } catch {
      return { rows: [], fields: {}, error: "Invalid JSON body." };
    }

    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      return {
        rows: [],
        fields: {},
        error: "`recipients` must be a non-empty array.",
      };
    }

    const rows: CsvRow[] = body.recipients
      .map((r) => {
        if (typeof r !== "object" || r === null) return {};
        const rec = r as Record<string, unknown>;
        const row: CsvRow = {};
        if (typeof rec.number === "string") row.number = rec.number.trim();
        if (typeof rec.message === "string") row.message = rec.message;
        if (typeof rec.attachmentUrl === "string")
          row.attachmentUrl = rec.attachmentUrl.trim();
        return row;
      })
      .filter(hasValue);

    if (rows.length === 0) {
      return {
        rows: [],
        fields: {},
        error: "No valid recipients found. Each recipient needs a `number`.",
      };
    }

    const fields: Record<string, string> = {};
    if (typeof body.attachmentUrl === "string")
      fields.attachmentUrl = body.attachmentUrl;

    return { rows, fields, error: null };
  }

  // Default: multipart file upload (CSV or XLSX).
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return {
      rows: [],
      fields: {},
      error:
        "Expected multipart/form-data with a CSV/XLSX `file`, or application/json with `recipients`.",
    };
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "file" && typeof value === "string") fields[key] = value;
  }

  const upload = formData.get("file");
  if (!upload || typeof upload === "string") {
    return { rows: [], fields, error: "A CSV or XLSX `file` upload is required." };
  }

  const file = upload as File;
  if (file.size > MAX_CSV_BYTES) {
    return {
      rows: [],
      fields,
      error: "File is too large. The maximum upload size is 3 MB.",
    };
  }

  let rows: CsvRow[];
  if (isXlsx(file)) {
    try {
      rows = await parseXlsx(await file.arrayBuffer());
    } catch {
      return {
        rows: [],
        fields,
        error: "Could not read the XLSX file. Make sure it's a valid .xlsx.",
      };
    }
  } else {
    rows = parseCsv(await file.text());
  }

  if (rows.length === 0) {
    return {
      rows: [],
      fields,
      error: "No rows with a `number` value were found.",
    };
  }
  return { rows, fields, error: null };
}
