"use client";

import * as React from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useBulkUpload, useUploadMeeting } from "@/lib/queries";

export function UploadRecordingSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upload = useUploadMeeting();
  const bulk = useBulkUpload();
  const [dragOver, setDragOver] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [queued, setQueued] = React.useState<string[]>([]);
  const [err, setErr] = React.useState("");

  const busy = upload.isPending || bulk.isPending;

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setErr("");
    try {
      if (arr.length === 1) {
        const res = await upload.mutateAsync({
          file: arr[0],
          title: title.trim() || undefined,
        });
        setQueued((prev) => [...prev, res.meeting_id]);
      } else {
        const res = await bulk.mutateAsync(arr);
        setQueued((prev) => [...prev, ...res.meetings.map((m) => m.meeting_id)]);
      }
      setTitle("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Upload recording"
      description="Transcode and transcription run automatically once the file lands."
    >
      <div className="flex flex-col gap-5">
        <Field
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          label="Title"
          hint="Optional — defaults to the filename. Ignored for multiple files."
          placeholder="Untitled"
        />

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg",
            "border border-dashed px-5 py-10 text-center",
            "transition-colors duration-150 ease-out",
            dragOver
              ? "border-accent bg-accent-tint"
              : "border-rule bg-sunk hover:border-ink-3",
          )}
        >
          <UploadSimple size={20} className="mb-2.5 text-ink-3" />
          <span className="text-[14.5px] text-ink-1">
            Drop files here, or click to choose
          </span>
          <span className="mt-1 text-[12.5px] text-ink-3">
            webm, mp4, mov, wav, mp3 — up to 500MB, max 20 files
          </span>
          <input
            type="file"
            accept="video/*,audio/*"
            multiple
            disabled={busy}
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>

        {busy && (
          <p className="text-[13px] text-ink-3" aria-live="polite">
            Uploading…
          </p>
        )}

        {err && <p className="text-[13px] text-live">{err}</p>}

        {queued.length > 0 && (
          <div>
            <p className="mb-2 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
              Queued
            </p>
            <ul className="flex flex-col gap-1">
              {queued.map((id) => (
                <li key={id} className="font-mono text-[12px] text-ink-2">
                  {id}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">
              They appear in Meetings as they finish processing.
            </p>
          </div>
        )}

        <div className="mt-auto flex justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
