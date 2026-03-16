"use client";

import { useState, useRef, forwardRef, useImperativeHandle, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";

// ── Validation helpers ────────────────────────────────────────

function hasMultipleUrls(raw: string): boolean {
  // Check for commas or semicolons (always invalid in a single URL context)
  if (raw.includes(",") || raw.includes(";")) return true;
  // Check for space-separated entries that look like URLs
  const parts = raw.trim().split(/\s+/);
  if (parts.length > 1) {
    // If more than one part contains a dot, user is probably entering multiple URLs
    const urlLikeParts = parts.filter((p) => p.includes("."));
    if (urlLikeParts.length > 1) return true;
  }
  return false;
}

function validateUrl(raw: string): { valid: boolean; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "" };

  // Reject multiple URLs
  if (hasMultipleUrls(trimmed)) {
    return { valid: false, error: "One URL at a time." };
  }

  // Add protocol for validation
  let testUrl = trimmed;
  if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
    testUrl = "https://" + testUrl;
  }

  try {
    const parsed = new URL(testUrl);
    // Must have at least one dot in hostname
    if (!parsed.hostname.includes(".")) {
      return { valid: false, error: "Enter a valid URL." };
    }
    // TLD must be at least 2 chars
    const tld = parsed.hostname.split(".").pop() || "";
    if (tld.length < 2) {
      return { valid: false, error: "Enter a valid URL." };
    }
  } catch {
    return { valid: false, error: "Enter a valid URL." };
  }

  return { valid: true, error: "" };
}

/** Extract a clean domain from a URL string for display */
function extractDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 4) return null;

  let testUrl = trimmed;
  if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
    testUrl = "https://" + testUrl;
  }

  try {
    const parsed = new URL(testUrl);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────
export interface UrlInputProps {
  /** Controlled value */
  value: string;
  /** Value change handler */
  onChange: (value: string) => void;
  /** Called with normalized URL on valid submit */
  onSubmit: (url: string) => void;
  /** Shows spinner on button */
  isLoading: boolean;
  /** Disables input + button */
  disabled?: boolean;
}

export const UrlInput = forwardRef<HTMLInputElement, UrlInputProps>(
  function UrlInput({ value, onChange, onSubmit, isLoading, disabled = false }, ref) {
    const [isFocused, setIsFocused] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const innerRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const validation = useMemo(() => validateUrl(value), [value]);
    const domain = useMemo(() => extractDomain(value), [value]);

    // Show error after user has typed something meaningful and it's invalid
    const showError = hasInteracted && !validation.valid && validation.error !== "" && value.trim().length > 2;

    // Show domain preview when valid and the raw text differs from normalized domain
    const showDomain = (() => {
      if (!domain || value.trim().length < 4 || showError) return false;
      if (!validation.valid) return false;
      // Only show if normalization is meaningful (stripping protocol, www, path, etc.)
      const raw = value.trim().toLowerCase();
      if (raw === domain) return false;
      return true;
    })();

    const handleSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading || disabled) return;

        const trimmed = value.trim();
        if (!trimmed) {
          innerRef.current?.focus();
          return;
        }

        setHasInteracted(true);
        const check = validateUrl(trimmed);
        if (!check.valid) return;

        let finalUrl = trimmed;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
          finalUrl = "https://" + finalUrl;
        }
        onSubmit(finalUrl);
      },
      [value, isLoading, disabled, onSubmit],
    );

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      if (value.trim().length > 2) setHasInteracted(true);
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    return (
      <div>
        <form onSubmit={handleSubmit}>
          <motion.div
            className="relative"
            animate={{
              boxShadow: showError
                ? "0 0 0 1px rgba(239,68,68,0.5), 0 0 20px rgba(239,68,68,0.08)"
                : isFocused
                  ? "0 0 0 1px rgba(232,164,74,0.4), 0 0 24px rgba(232,164,74,0.08), 0 0 48px rgba(232,164,74,0.04)"
                  : "0 0 0 1px var(--border-default), 0 0 0 rgba(232,164,74,0)",
            }}
            transition={{ duration: 0.3 }}
            style={{ borderRadius: "10px" }}
          >
            <div
              className="flex items-center gap-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderRadius: "10px",
              }}
            >
              <input
                ref={innerRef}
                type="text"
                value={value}
                onChange={handleChange}
                placeholder="https://yoursite.com"
                disabled={disabled || isLoading}
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                className="flex-1 h-[56px] px-5 bg-transparent text-[14px] outline-none placeholder:opacity-25"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-primary)",
                }}
                aria-label="Enter a website URL to analyze"
                aria-invalid={showError}
                aria-describedby={showError ? "url-input-error" : showDomain ? "url-input-domain" : undefined}
                autoComplete="url"
                spellCheck={false}
              />
              <motion.button
                type="submit"
                disabled={isLoading || disabled}
                className="h-[44px] px-7 mr-[6px] text-[12px] font-semibold uppercase tracking-[0.1em] rounded-[7px] flex items-center gap-2.5 disabled:opacity-50 shrink-0 cursor-pointer"
                style={{
                  fontFamily: "var(--font-display)",
                  backgroundColor: "var(--accent)",
                  color: "#0a0a0c",
                }}
                whileHover={!isLoading && !disabled ? { scale: 1.03 } : {}}
                whileTap={!isLoading && !disabled ? { scale: 0.97 } : {}}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onMouseEnter={(e) => {
                  if (!isLoading && !disabled) e.currentTarget.style.backgroundColor = "var(--accent-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--accent)";
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Testing</span>
                  </>
                ) : (
                  <>
                    <span>Trash it</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </form>

        {/* Domain preview / validation feedback */}
        <div className="h-6 mt-1.5 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {showError ? (
              <motion.div
                key="error"
                id="url-input-error"
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 text-[11px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
              >
                <AlertCircle size={11} />
                <span>{validation.error}</span>
              </motion.div>
            ) : showDomain ? (
              <motion.div
                key="domain"
                id="url-input-domain"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 text-[11px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                <span style={{ opacity: 0.5 }}>&rarr;</span>
                <span>{domain}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  },
);
