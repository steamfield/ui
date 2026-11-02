import { initReveal } from "@steamfield/ui/reveal";
import { type ReactElement, useEffect } from "react";

const roles = [
  "",
  "quiet",
  "card",
  "drop",
  "popover",
  "wipe",
  "lift-xs",
  "lift-sm",
  "lift-md",
  "lift-lg",
  "lift-xl",
  "lift-card",
  "blur-in-soft",
  "scale-in-media",
  "slide-in-chip",
  "fade-up",
  "blur-in",
  "bounce-in",
  "slide-left",
  "slide-right",
];

export function RevealPage(): ReactElement {
  // initReveal sets html[data-motion-ready] itself when motion is allowed; its disposer removes it.
  useEffect(() => initReveal(), []);
  return (
    <div className="pg-reveal">
      {/* A full screen of static intro, so no entrance is mid-transition when the page loads. */}
      <div className="pg-reveal-intro">
        <h1>reveal</h1>
        <p>Scroll down. Each section uses one entrance role.</p>
      </div>
      {roles.map((role) => (
        <section
          key={role || "default"}
          className="pg-reveal-section"
          data-reveal
          data-role={role || "default"}
          aria-labelledby={`rv-${role || "default"}`}
        >
          <h2 id={`rv-${role || "default"}`}>{role || "default"}</h2>
          <div className="pg-reveal-card" data-motion={role}>
            Role: {role || "default"}
          </div>
        </section>
      ))}
      <section
        className="pg-reveal-section"
        data-reveal="quiet"
        data-role="quiet-container"
        aria-labelledby="rv-quiet-container"
      >
        <h2 id="rv-quiet-container">Quiet container</h2>
        <div className="pg-reveal-card" data-motion>
          Inside a quiet container.
        </div>
      </section>
      <section
        className="pg-reveal-section"
        data-reveal
        data-role="stagger"
        aria-labelledby="rv-stagger"
      >
        <h2 id="rv-stagger">Staggered parts</h2>
        <ul className="pg-reveal-list">
          {["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((item) => (
            <li key={item} data-motion-part>
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section
        className="pg-reveal-section"
        data-reveal
        data-role="focus"
        aria-labelledby="rv-focus"
      >
        <h2 id="rv-focus">Focus target</h2>
        <div className="pg-reveal-card" data-motion>
          <a href="#/reveal" id="pg-reveal-link">
            A link in the last section
          </a>
        </div>
      </section>
    </div>
  );
}
