"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";

const MAX_CSV_BYTES = 3 * 1024 * 1024; // 3 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function looksLikeSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === XLSX_MIME
  );
}

export function CsvDropzone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    if (!looksLikeSpreadsheet(f)) {
      setRejected(`“${f.name}” isn’t a CSV or XLSX file.`);
      return;
    }
    if (f.size > MAX_CSV_BYTES) {
      setRejected(`“${f.name}” is ${formatBytes(f.size)} — the limit is 3 MB.`);
      return;
    }
    setRejected(null);
    onFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const border = rejected
    ? "var(--danger)"
    : dragging
      ? "var(--accent)"
      : file
        ? "var(--accent)"
        : "var(--border-strong)";

  return (
    <div className="space-y-2">
      {/* Hidden native input */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {file ? (
        /* Selected-file state */
        <div
          className="rounded-xl border p-4 flex items-center gap-3"
          style={{ borderColor: border, background: "var(--accent-soft)" }}
        >
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--accent)] text-[#04130d] shrink-0">
            <Icon name="list" className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs muted">{formatBytes(file.size)} · ready to send</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn btn-ghost !py-1.5 !px-3 text-xs"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => {
              onFile(null);
              setRejected(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove file"
            className="grid place-items-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Empty / drag state */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={onDrop}
          className="w-full rounded-xl border border-dashed p-8 text-center transition-colors cursor-pointer"
          style={{
            borderColor: border,
            background: dragging ? "var(--accent-soft)" : "var(--surface-2)",
          }}
        >
          <span
            className={`mx-auto grid place-items-center w-12 h-12 rounded-2xl mb-3 transition-colors ${
              dragging
                ? "bg-[var(--accent)] text-[#04130d]"
                : "bg-[var(--surface-inset)] text-[var(--muted)]"
            }`}
          >
            <Icon name="download" className="w-6 h-6" />
          </span>
          <p className="text-sm font-medium">
            {dragging
              ? "Drop your file to upload"
              : "Drag & drop your CSV or XLSX here"}
          </p>
          <p className="text-xs muted mt-0.5">
            or <span className="text-[var(--accent)] font-medium">browse files</span> —
            .csv / .xlsx up to 3 MB
          </p>
        </button>
      )}

      {rejected && <p className="text-xs text-red-500">{rejected}</p>}
    </div>
  );
}
