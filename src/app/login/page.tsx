import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { ThemeSelect } from "@/components/theme-select";
import { supabaseConfig } from "@/lib/env";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="architectural-art" aria-hidden="true">
          <div className="arch arch-one" />
          <div className="arch arch-two" />
          <div className="arch arch-three" />
          <span className="art-coordinate">01 / A SHARED PERSPECTIVE</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">THE OPULENCE WORKSPACE</span>
          <h1>
            Every space.
            <br />
            <span>One vision.</span>
          </h1>
          <p>
            Bring your people, projects, and possibilities
            <br className="desktop-only" /> into one considered workspace.
          </p>
        </div>
        <div className="story-footer">
          <span>DESIGNED FOR THE WAY WE CREATE.</span>
          <span>ONE ODC</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-theme">
          <ThemeSelect />
        </div>
        <div className="login-content">
          <span className="eyebrow">WELCOME TO ONE ODC</span>
          <h2>Good work starts here.</h2>
          <p className="login-subtitle">
            Sign in to keep every detail moving forward.
          </p>
          <LoginForm configured={!!supabaseConfig()} />
        </div>
        <footer>One ODC · Opulence Design Concept</footer>
      </section>
    </main>
  );
}
