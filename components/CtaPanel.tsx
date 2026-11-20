import { Icon } from "./Icon";

export function CtaPanel() {
  return (
    <div className="wrap reveal">
      <div className="cta-panel">
        <div className="shine" />
        <div className="cta-orbit" />
        <h2>
          Send it your <span className="shimmer">first command.</span>
        </h2>
        <p>Connect your tools. Tell Tandem what you need. Get it done.</p>
        <a
          className="btn btn-primary btn-lg"
          href="https://t.me/tandem_devops_bot"
          target="_blank"
          rel="noopener"
        >
          <Icon name="tg" /> Start on Telegram — it&apos;s free
        </a>
      </div>
    </div>
  );
}
