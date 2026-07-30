import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { CrewAvatar } from "../../console/src/components/ui/crew-avatar/crew-avatar.js";
import { MemoryStoryboard } from "./storyboard.js";
import "./styles.css";

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Crew home">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>crew</span>
    </a>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <span className="footer-byline">Built by <a href="https://github.com/Onnokh">Onkie</a></span>
      <nav aria-label="Footer navigation">
        <a href="https://github.com/Onnokh/crew">GitHub</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </footer>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="page" id="top">
      <header className="mobile-header">
        <Brand />
        <button type="button" className="menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span /><span /></button>
        {menuOpen && <nav className="mobile-menu" aria-label="Mobile navigation"><a href="https://github.com/Onnokh/crew">GitHub</a><a href="mailto:hello@use-crew.app">Contact</a></nav>}
      </header>

      <div className="split-view">
        <section className="copy-pane">
          <main className="copy-main">
            <div className="hero-avatar-placement"><CrewAvatar /></div>
            <div className="copy-stack">
              <h1><span>I'm Crew.</span> <em>Your agents get smarter together.</em></h1>
              <p>Like great coworkers, your agents learn things every day: a deployment fix, a debugging shortcut, a production lesson learned the hard way.</p>
              <p>Crew helps them share those discoveries with the rest of the team, so every agent can build on what came before. Less repeated work. Fewer forgotten lessons. A team that gets stronger with every task completed.</p>
            </div>
            <div className="actions">
              <span className="pill primary coming-soon" aria-disabled="true">Coming soon.</span>
            </div>
          </main>
          <Footer />
        </section>
        <div className="rail" aria-hidden="true" />
        <section className="visual-pane">
          <LazyMotion features={domAnimation}>
            <MotionConfig reducedMotion="user">
              <MemoryStoryboard />
            </MotionConfig>
          </LazyMotion>
        </section>
      </div>

      <div className="mobile-footer"><Footer /></div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
