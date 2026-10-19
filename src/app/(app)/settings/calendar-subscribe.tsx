"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers (and http origins) have no async clipboard; selecting the text lets the user copy it.
      inputRef.current?.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      }
    }
    setCopied(true);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <Input ref={inputRef} id={id} value={value} readOnly onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
        <Button type="button" variant="outline" size="md" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0" data-testid={`copy-${id}`}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** The two subscription links with copy buttons. */
export function CalendarSubscribe({ webcalUrl, httpsUrl }: { webcalUrl: string; httpsUrl: string }) {
  return (
    <div className="space-y-3">
      <CopyField id="calendar-webcal" label="Subscribe link (webcal)" value={webcalUrl} />
      <CopyField id="calendar-https" label="Feed URL (https)" value={httpsUrl} />
    </div>
  );
}
