import { Icon } from "./Icon";
import { PhoneMock } from "./PhoneMock";

export function Hero() {
  return (
    <header className="wrap hero" id="top">
      <div>
        <div className="badge reveal">
          <Icon name="check" /> LIVE ON TELEGRAM · v0.4
        </div>
        <h1 className="reveal">
          Your dev stack.
          <br />
          <span className="grad">One chat.</span>
        </h1>
        <p className="sub reveal">
          Tandem is your development ecosystem, connected in one place. Create
          repositories, ship deployments and manage infrastructure — just by
          talking to it.
        </p>
        <div className="hero-ctas reveal">
          <a
            className="btn btn-primary btn-lg"
            href="https://t.me/tandem_devops_bot"
            target="_blank"
            rel="noopener"
          >
            <Icon name="tg" /> Start on Telegram
          </a>
          <a className="btn btn-ghost btn-lg" href="#features">
            <Icon name="play" /> See how it works
          </a>
        </div>
        <p className="hero-note reveal">
          <Icon name="lock" /> Free to start · Your tokens, AES-256 encrypted ·
          No card, no servers
        </p>
      </div>

      <div className="hero-visual">
        <div className="pill-float p1">
          <Icon name="star" /> Starred&nbsp;<b>octo/calder-api</b>
        </div>
        <div className="pill-float p2">
          <Icon name="rocket" /> Deploy live&nbsp;·&nbsp;
          <b style={{ color: "#1D83C8" }}>my-app.vercel.app</b>
        </div>
        <PhoneMock />
      </div>
    </header>
  );
}
