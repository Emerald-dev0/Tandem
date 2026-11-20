import { Icon } from "./Icon";
import { PhoneMock } from "./PhoneMock";

export function Hero() {
  return (
    <header className="wrap hero" id="top">
      <div className="badge rise rise-1">
        <span className="pulse" /> LIVE ON TELEGRAM · v0.4
      </div>
      <h1 className="rise rise-2">
        <span className="line thin">Your dev stack.</span>
        <span className="line shimmer">One chat.</span>
      </h1>
      <p className="sub rise rise-3">
        Tandem is your development ecosystem, connected in one place. Create
        repositories, ship deployments, manage infrastructure — just by talking
        to it.
      </p>
      <div className="hero-ctas rise rise-4">
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
      <div className="trust rise rise-5">
        <span className="t-item">
          <Icon name="lock" /> AES-256 encrypted tokens
        </span>
        <span className="t-item">
          <Icon name="flash" /> Replies in seconds
        </span>
        <span className="t-item">
          <Icon name="shield" /> Confirm before anything breaks
        </span>
      </div>

      <div className="stage rise rise-5">
        <div className="stage-glow" />
        <div className="float-chip fc-a">
          <Icon name="star" /> Starred <b>octo/calder-api</b>
        </div>
        <div className="float-chip fc-b">
          <Icon name="rocket" /> <b>my-app.vercel.app</b> <span style={{ color: "#7DD3FC" }}>LIVE</span>
        </div>
        <div className="float-chip fc-c">
          <Icon name="check" /> PR #24 merged
        </div>
        <PhoneMock />
      </div>
    </header>
  );
}
