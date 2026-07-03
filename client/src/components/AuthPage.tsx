import { useEffect, useRef, useState } from "react";
import { fetchAuthConfig, login, loginWithGoogle, register } from "../api";
import type { User } from "../api";

/** Temporary — remove when Google sign-in is stable in production */
const EMAIL_PASSWORD_AUTH_ENABLED = true;

interface AuthPageProps {
  onSuccess: (user: User) => void;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const googleWrapRef = useRef<HTMLDivElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchAuthConfig()
      .then((config) => setGoogleClientId(config.googleClientId))
      .catch(() => {
        /* Google sign-in stays hidden if config fails */
      });
  }, []);

  useEffect(() => {
    if (!googleClientId) return;

    const clientId = googleClientId;
    let cancelled = false;

    function initGoogle(): boolean {
      if (cancelled || !window.google || !googleButtonRef.current) {
        return false;
      }

      if (googleButtonRef.current.dataset.initialized) {
        return true;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          void (async () => {
            setError("");
            setLoading(true);
            try {
              const result = await loginWithGoogle(response.credential);
              onSuccess(result.user);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Google sign-in failed",
              );
            } finally {
              setLoading(false);
            }
          })();
        },
        use_fedcm_for_prompt: true,
      });

      const width = googleWrapRef.current?.offsetWidth ?? 400;

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: Math.min(width, 400),
      });

      googleButtonRef.current.dataset.initialized = "true";

      return Boolean(
        googleButtonRef.current.querySelector('div[role="button"]'),
      );
    }

    if (initGoogle()) return;

    const interval = window.setInterval(() => {
      if (initGoogle()) {
        window.clearInterval(interval);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [googleClientId, onSuccess]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await login(form.email, form.password)
          : await register(form.name, form.email, form.password);
      onSuccess(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden>
            <span className="play-icon" />
          </div>
          <span className="brand-name">Persona</span>
        </div>
      </header>

      <main className="auth-main">
        <p className="auth-eyebrow">
          {isLogin ? "Welcome back" : "Get started"}
        </p>
        <h1 className="auth-title">
          {isLogin ? "Sign in to Persona" : "Create your account"}
        </h1>
        <p className="auth-subtitle">
          Chat with AI personas of your favorite creators
        </p>

        {googleClientId ? (
          <div
            ref={googleWrapRef}
            className={`google-signin-wrap${loading ? " is-loading" : ""}`}
          >
            <div className="btn-google btn-google-visual" aria-hidden="true">
              <GoogleIcon />
              Continue with Google
            </div>
            <div ref={googleButtonRef} className="google-signin-overlay" />
          </div>
        ) : (
          <p className="auth-subtitle">Sign-in is temporarily unavailable.</p>
        )}

        {EMAIL_PASSWORD_AUTH_ENABLED && (
          <>
            {googleClientId && (
              <div className="auth-divider">
                <span>OR</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              {!isLogin && (
                <label className="field">
                  <span className="field-label">Name</span>
                  <input
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
              )}

              <label className="field">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  minLength={8}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                />
              </label>

              {error && <p className="error">{error}</p>}

              <button
                type="submit"
                className="btn-primary btn-auth-submit"
                disabled={loading}
              >
                {loading ? "..." : isLogin ? "Sign in" : "Create account"}
              </button>
            </form>

            <p className="auth-switch">
              {isLogin ? "New here? " : "Already have an account? "}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode(isLogin ? "register" : "login");
                  setError("");
                }}
              >
                {isLogin ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}

        {!EMAIL_PASSWORD_AUTH_ENABLED && error && (
          <p className="error">{error}</p>
        )}
      </main>

      <footer className="auth-footer">
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
        <span>© 2026 Persona</span>
      </footer>
    </div>
  );
}
