"use client";

import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";

interface GlowInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  buttonText?: string;
  loadingText?: string;
  isLoading?: boolean;
  buttonIcon?: React.ReactNode;
  className?: string;
}

export const GlowInput = forwardRef<HTMLInputElement, GlowInputProps>(
  function GlowInput(
    {
      value,
      onChange,
      onSubmit,
      placeholder = "https://yoursite.com",
      disabled = false,
      buttonText = "Trash it",
      loadingText = "Testing",
      isLoading = false,
      buttonIcon,
      className = "",
    },
    ref
  ) {
    const [isFocused, setIsFocused] = useState(false);
    const innerRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoading && onSubmit) onSubmit();
    };

    return (
      <form onSubmit={handleSubmit} className={className}>
        <motion.div
          className="relative"
          animate={{
            boxShadow: isFocused
              ? "0 0 0 1px rgba(232,164,74,0.4), 0 0 20px rgba(232,164,74,0.08), 0 0 40px rgba(232,164,74,0.04)"
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
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="flex-1 h-[56px] px-5 bg-transparent text-[14px] outline-none placeholder:opacity-25"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
              }}
              aria-label="Website URL"
            />
            <button
              type="submit"
              disabled={isLoading || disabled}
              className="h-[44px] px-7 mr-[6px] text-[12px] font-semibold uppercase tracking-[0.1em] rounded-[7px] transition-all duration-200 flex items-center gap-2.5 disabled:opacity-50 shrink-0 cursor-pointer"
              style={{
                fontFamily: "var(--font-display)",
                backgroundColor: "var(--accent)",
                color: "#0a0a0c",
              }}
              onMouseEnter={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--accent)";
              }}
            >
              {isLoading ? (
                <>
                  <motion.div
                    className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  />
                  <span>{loadingText}</span>
                </>
              ) : (
                <>
                  <span>{buttonText}</span>
                  {buttonIcon}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </form>
    );
  }
);
