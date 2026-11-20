import { Icon } from "./Icon";

export function Footer() {
  return (
    <footer>
      <div className="wrap foot-in">
        <div className="logo" style={{ fontSize: 17 }}>
          <span
            className="mark"
            style={{ width: 28, height: 28, borderRadius: 9, fontSize: 14 }}
          >
            <Icon name="tg" />
          </span>
          Tandem
        </div>
        <div className="foot-links">
          <a
            href="https://github.com/Emerald-dev0/Tandem"
            target="_blank"
            rel="noopener"
          >
            <Icon name="gh" /> GitHub
          </a>
          <a
            href="https://github.com/Emerald-dev0/Tandem/blob/main/SECURITY.md"
            target="_blank"
            rel="noopener"
          >
            <Icon name="shield" /> Security
          </a>
          <a
            href="https://t.me/tandem_devops_bot"
            target="_blank"
            rel="noopener"
          >
            <Icon name="tg" /> Telegram
          </a>
        </div>
        <div>© 2026 Tandem · Built for builders</div>
      </div>
    </footer>
  );
}
