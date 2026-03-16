"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { X, Mail, Lock, Chrome, CreditCard, Check, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** If true, skip auth and show the payment step directly */
  showPayment?: boolean;
}

type Step = "auth" | "payment";

export function AuthModal({ isOpen, onClose, showPayment = false }: AuthModalProps) {
  const [step, setStep] = useState<Step>(showPayment ? "payment" : "auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: window.location.href });
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Register first, then sign in
        const registerRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/auth/register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          }
        );

        if (!registerRes.ok) {
          const data = await registerRes.json();
          setError(data.detail || "Registration failed.");
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      // Move to payment step after successful auth
      setStep("payment");
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        setError("Failed to start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Failed to start checkout. Please try again.");
      setCheckoutLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-[420px] rounded-xl p-6 pointer-events-auto"
              style={{
                backgroundColor: "#0a0a0f",
                border: "1px solid var(--border-default)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(232,164,74,0.05)",
              }}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-md transition-colors cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <X size={16} />
              </button>

              <AnimatePresence mode="wait">
                {step === "auth" ? (
                  <motion.div
                    key="auth"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Header */}
                    <div className="mb-6">
                      <div
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md mb-3"
                        style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ fontFamily: "var(--font-display)", color: "#ef4444" }}>
                          Free analysis used
                        </span>
                      </div>
                      <h2
                        className="text-[22px] font-bold leading-tight mb-1.5"
                        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                      >
                        Your free analysis is used up
                      </h2>
                      <p
                        className="text-[13px] leading-relaxed"
                        style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
                      >
                        Create an account to unlock unlimited analyses for a one-time $5 payment.
                      </p>
                    </div>

                    {/* Google sign-in */}
                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full h-[44px] rounded-lg text-[13px] font-medium flex items-center justify-center gap-2.5 transition-all duration-200 mb-3 cursor-pointer"
                      style={{
                        fontFamily: "var(--font-display)",
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-default)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
                    >
                      <Chrome size={16} />
                      Sign up with Google
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                      <span className="text-[10px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                        or
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                    </div>

                    {/* Email form */}
                    <form onSubmit={handleCredentialsSubmit} className="space-y-3">
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                        <input
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full h-[40px] pl-9 pr-4 rounded-lg text-[13px] outline-none"
                          style={{
                            fontFamily: "var(--font-mono)",
                            backgroundColor: "var(--bg-surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-default)",
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.4)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
                        />
                      </div>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                        <input
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-[40px] pl-9 pr-4 rounded-lg text-[13px] outline-none"
                          style={{
                            fontFamily: "var(--font-mono)",
                            backgroundColor: "var(--bg-surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-default)",
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.4)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
                        />
                      </div>

                      {/* Error */}
                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-[11px]"
                            style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-[44px] rounded-lg text-[12px] font-semibold uppercase tracking-[0.1em] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        style={{
                          fontFamily: "var(--font-display)",
                          backgroundColor: "var(--accent)",
                          color: "#0a0a0c",
                        }}
                        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; }}
                      >
                        {loading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <span>{isSignUp ? "Sign Up with Email" : "Sign In"}</span>
                        )}
                      </button>
                    </form>

                    {/* Toggle sign-up / sign-in */}
                    <p className="text-center mt-4 text-[12px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                      {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                      <button
                        onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
                        className="underline cursor-pointer bg-transparent border-none"
                        style={{ color: "var(--accent)", fontFamily: "inherit", fontSize: "inherit" }}
                      >
                        {isSignUp ? "Sign in" : "Sign up"}
                      </button>
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Payment step */}
                    <div className="mb-6">
                      <div
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md mb-3"
                        style={{ backgroundColor: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)" }}
                      >
                        <Check size={12} style={{ color: "#22c55e" }} />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ fontFamily: "var(--font-display)", color: "#22c55e" }}>
                          Account created
                        </span>
                      </div>
                      <h2
                        className="text-[22px] font-bold leading-tight mb-1.5"
                        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                      >
                        Unlock unlimited analyses
                      </h2>
                      <p
                        className="text-[13px] leading-relaxed"
                        style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
                      >
                        One-time $5. Unlimited analyses. No subscription.
                      </p>
                    </div>

                    {/* Price card */}
                    <div
                      className="rounded-lg p-5 mb-5"
                      style={{
                        backgroundColor: "rgba(232,164,74,0.04)",
                        border: "1px solid rgba(232,164,74,0.15)",
                      }}
                    >
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span
                          className="text-[36px] font-bold"
                          style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
                        >
                          $5
                        </span>
                        <span
                          className="text-[13px]"
                          style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
                        >
                          one-time
                        </span>
                      </div>

                      <div className="space-y-2">
                        {[
                          "Unlimited website analyses",
                          "All audit modes (Fast, Standard, Deep)",
                          "Full AI-generated reports",
                          "No recurring charges ever",
                        ].map((feature) => (
                          <div key={feature} className="flex items-center gap-2">
                            <Check size={12} style={{ color: "var(--accent)" }} />
                            <span
                              className="text-[12px]"
                              style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
                            >
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-[11px] mb-3"
                          style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* Checkout button */}
                    <button
                      onClick={handleCheckout}
                      disabled={checkoutLoading}
                      className="w-full h-[48px] rounded-lg text-[13px] font-semibold uppercase tracking-[0.08em] transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                      style={{
                        fontFamily: "var(--font-display)",
                        backgroundColor: "var(--accent)",
                        color: "#0a0a0c",
                      }}
                      onMouseEnter={(e) => { if (!checkoutLoading) e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; }}
                    >
                      {checkoutLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <CreditCard size={16} />
                          Pay $5 — Unlock Forever
                        </>
                      )}
                    </button>

                    <p
                      className="text-center mt-3 text-[11px]"
                      style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
                    >
                      Secure payment powered by Stripe
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
