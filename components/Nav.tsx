import { Icon } from "./Icon";

export function Nav() {
  return (
    <nav>
      <div className="wrap nav-in">
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
      </div>
    </nav>
  );
}
