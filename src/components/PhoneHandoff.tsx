"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copyable } from "./ui";

/**
 * Getting a long link from a laptop onto the phone that will hold the Shortcut is
 * the friction point here, so the QR code is the primary path and copy is the fallback.
 *
 * "copy" = the QR opens a page that hands them the link with a Copy button.
 * "install" = the QR opens the shortcut itself; there is nothing to copy.
 */
type Mode = "copy" | "install";

export function PhoneHandoff({ url, label, mode = "copy" }: { url: string; label?: string; mode?: Mode }) {
  const [dataUrl, setDataUrl] = useState("");
  const [open, setOpen] = useState(false);

  // Scanning used to land on the raw JSON of /api/capture, which looks broken to
  // anyone non-technical, so the link QR points at a page built for copying.
  const target =
    mode === "copy" && typeof window !== "undefined"
      ? `${window.location.origin}/link?u=${encodeURIComponent(url)}`
      : url;

  useEffect(() => {
    if (!target) return;
    let alive = true;
    QRCode.toDataURL(target, {
      width: 480,
      margin: 1,
      color: { dark: "#462e29", light: "#fffcf7" },
      errorCorrectionLevel: "M",
    }).then(
      (d) => {
        if (alive) setDataUrl(d);
      },
      () => setDataUrl(""),
    );
    return () => {
      alive = false;
    };
  }, [target]);

  if (!url) return null;

  return (
    <div className="rounded-2xl border border-line bg-panel-2 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
          {mode === "install" ? "QR 2 — installs the shortcut" : "QR 1 — gives you the link"}
        </span>
        <span className="text-sm font-semibold">{label ?? "Send this to your phone"}</span>
      </div>
      {mode === "install" ? (
        <div className="mb-4 space-y-2 text-[14px] leading-relaxed text-muted">
          <p>
            <strong className="text-ink/80">This square is not the same as the other one.</strong> There is nothing to
            copy here — it installs the shortcut itself.
          </p>
          <p>
            Point your iPhone camera at it, tap the little <strong>yellow bar</strong> that slides in at the top of the
            screen (that bar <em>is</em> the button — it&apos;s easy to miss and it disappears after a few seconds; if
            it does, just point the camera at the square again), then tap <strong>Add Shortcut</strong>.
          </p>
          <p>
            No Shortcuts app on the phone? It comes with the iPhone, but if it was deleted, get it free from the App
            Store first, then scan this square again.
          </p>
        </div>
      ) : (
        <div className="mb-4 space-y-2 text-[14px] leading-relaxed text-muted">
          <p>
            Point your iPhone camera at this square and tap the <strong>yellow bar</strong> that slides in at the top
            (that bar is the button; if it vanishes, point the camera at the square again).
          </p>
          <p>
            Safari opens a page with your link on it and one big <strong>Copy my capture link</strong> button. Tap
            that, and the link is on your phone ready to paste into the shortcut.
          </p>
        </div>
      )}

      {dataUrl ? (
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={mode === "install" ? "QR code that installs the shortcut" : "QR code containing your capture link"}
            className="h-52 w-52 rounded-xl bg-white p-2"
          />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[13px] text-accent hover:underline"
          >
            {open
              ? "Hide the link"
              : mode === "install"
                ? "Already on your phone? Show the link instead"
                : "Already on your phone? Copy the link instead"}
          </button>
        </div>
      ) : null}

      {open || !dataUrl ? (
        <div className="mt-4">
          <Copyable value={url} />
        </div>
      ) : null}
    </div>
  );
}
