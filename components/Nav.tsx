import { Icon } from "./Icon";

export function Nav() {
  return (
    <div className="nav-wrap">
      <nav className="nav-pill">
        <a className="logo" href="#top">
          <span className="mark">
            <Icon name="tg" />
          </span>
          Tandem
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#roadmap">Roadmap</a>
        </div>
        <a
          className="btn btn-primary"
          href="https://t.me/tandem_devops_bot"
          target="_blank"
          rel="noopener"
        >
          <Icon name="tg" /> Open in Telegram
        </a>
      </nav>
    </div>
  );
}
