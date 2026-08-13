"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
};

/**
 * Nativní window.confirm v některých prohlížečích (a u Base UI Button) tiše
 * nic neudělá — dialog v aplikaci je spolehlivý a ukáže se vždy.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const pendingRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve;
      setState(opts);
    });
  }, []);

  const close = useCallback((value: boolean) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const dialog = state ? (
    <ConfirmDialogView
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel ?? "Potvrdit"}
      cancelLabel={state.cancelLabel ?? "Zrušit"}
      variant={state.variant ?? "default"}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialogView({
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "destructive" | "default";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Zavřít"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="border-border bg-card relative z-10 w-full max-w-md rounded-xl border p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <p id={descId} className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
