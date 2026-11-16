import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { Brand } from "../components/brand";

const steps = [
  [
    "01",
    "Give it your knowledge",
    "Add your product information as text, PDF, Markdown or TXT.",
  ],
  [
    "02",
    "Make it feel at home",
    "Use the default widget or customize its appearance with Pro.",
  ],
  [
    "03",
    "One snippet. You're there.",
    "Add a script tag to your website. Help is a conversation away.",
  ],
];
const comparison = [
  ["Projects", "1", "5"],
  ["Messages / month, per project", "100", "2,000"],
  ["Knowledge sources / project", "3", "25"],
  ["Button color", "Default", "Any"],
  ["Button position", "Bottom right", "Any corner"],
  ["Button label", "Default", "Custom"],
  ["Open animation", "Fade", "Fade / slide / scale"],
  ["Header text", "Default", "Custom"],
  ["Powered by badge", "Shown", "Hidden"],
];

export default function Home() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Plans</a>
          <Link className="button button-small" href="/sign-up">
            Start free <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> YOUR KNOWLEDGE. ALWAYS ON.
            </p>
            <h1 id="hero-title">
              Good questions.
              <br />
              <span>Clear answers.</span>
            </h1>
            <p className="hero-description">
              Turn your product knowledge into helpful conversations. An AI
              support widget that answers from your information, right on your
              website.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/sign-up">
                Start free <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-link" href="#how-it-works">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="fine-print">
              Your information. One script tag. A little less repetition.
            </p>
          </div>
          <div
            className="demo-panel glass"
            id="demo"
            role="region"
            aria-labelledby="demo-title"
          >
            <div className="panel-top">
              <span className="small-label">THE CONVERSATION, SIMPLIFIED</span>
              <span aria-hidden="true">↗</span>
            </div>
            <div className="demo-orbit" aria-hidden="true">
              <span>a</span>
            </div>
            <div className="demo-caption">
              <span className="pill">STATIC PREVIEW</span>
              <h2 id="demo-title">A space for better support.</h2>
              <p>
                The live {APP_NAME} demo is coming at launch. This preview does
                not send messages.
              </p>
            </div>
            <div className="demo-input" aria-hidden="true">
              <span>Your next good question…</span>
              <span>↑</span>
            </div>
          </div>
        </section>
        <div className="section-divider wrap">
          <span>LESS SEARCHING. MORE UNDERSTANDING.</span>
          <span aria-hidden="true">↓</span>
        </div>
        <section
          className="section wrap"
          id="how-it-works"
          aria-labelledby="steps-title"
        >
          <div className="section-heading">
            <p className="eyebrow">A SHORT PATH TO HELPFUL</p>
            <h2 id="steps-title">
              From your docs
              <br />
              to their next step.
            </h2>
          </div>
          <div className="steps">
            {steps.map(([number, title, text]) => (
              <article className="step" key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          className="section wrap"
          id="pricing"
          aria-labelledby="pricing-title"
        >
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">ROOM TO GROW</p>
              <h2 id="pricing-title">
                Start small.
                <br />
                Stay helpful.
              </h2>
            </div>
            <p>
              Free for your first project.
              <br />
              Pro for more knowledge and a widget that feels like you.
            </p>
          </div>
          <div className="glass pricing-panel">
            <table>
              <caption className="sr-only">
                Free and Pro plan feature comparison
              </caption>
              <thead>
                <tr>
                  <th scope="col">Included</th>
                  <th scope="col">Free</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(([feature, free, pro]) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    <td>{free}</td>
                    <td>{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pricing-footer">
              <p>Explore the plans. Billing and checkout are coming later.</p>
              <Link className="button button-small" href="/sign-up">
                Start free <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>
        <section
          className="section wrap install-section"
          aria-labelledby="install-title"
        >
          <div>
            <p className="eyebrow">SMALL SNIPPET. BIG DIFFERENCE.</p>
            <h2 id="install-title">Fits right in.</h2>
            <p>
              Add one script tag to your website.
              <br />
              Your project&apos;s Install page will provide the real snippet.
            </p>
          </div>
          <div className="glass code-panel">
            <span className="small-label">
              ILLUSTRATIVE SNIPPET · NOT READY TO INSTALL
            </span>
            <pre>
              <code>
                {
                  '<script\n  src="https://YOUR_APP_URL/widget.js"\n  data-key="YOUR_PROJECT_PUBLIC_KEY"\n  defer\n></script>'
                }
              </code>
            </pre>
          </div>
        </section>
        <section className="closing wrap">
          <p className="eyebrow">MAKE EVERY QUESTION A GOOD START</p>
          <h2>
            Your knowledge.
            <br />
            Ready to help.
          </h2>
          <Link className="button" href="/sign-up">
            Start free <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <p>Helpful answers start with what you know.</p>
        <a href="#main">Back to top ↑</a>
      </footer>
    </div>
  );
}
