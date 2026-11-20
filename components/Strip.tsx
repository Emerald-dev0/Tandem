import { Icon } from "./Icon";

export function Strip() {
  return (
    <div className="wrap strip reveal">
      <span>Works with</span>
      <span className="chip">
        <Icon name="gh" /> GitHub
      </span>
      <span className="chip">
        <Icon name="vercel" /> Vercel
      </span>
      <span className="chip">
        <Icon name="cloud" /> Cloudflare <span className="soon">Soon</span>
      </span>
      <span className="chip">
        <Icon name="server" /> Render <span className="soon">Soon</span>
      </span>
    </div>
  );
}
