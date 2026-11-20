import { Icon } from "./Icon";

const STEPS = [
  {
    num: "STEP 01",
    icon: "botmsg",
    title: "Open the bot",
    text: "Tap “Start on Telegram”. Your account exists instantly — no forms, no password, no email.",
  },
  {
    num: "STEP 02",
    icon: "shield",
    title: "Connect your tools",
    text: "One-tap “Log in with GitHub / Vercel”. Credentials are AES-256 encrypted and never shown back.",
  },
  {
    num: "STEP 03",
    icon: "flash",
    title: "Just ask",
    text: "“Create a repo.” “Deploy it.” “What happened today?” Tandem does the rest — and confirms before anything breaks.",
  },
];

export function Steps() {
  return (
    <section id="how">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">How it works</div>
          <h2>
            Three steps. <span className="dim">Ninety seconds.</span>
          </h2>
        </div>
        <div className="timeline">
          {STEPS.map((s) => (
            <div className="tl-step reveal" key={s.num}>
              <div className="tl-dot">
                <Icon name={s.icon} />
              </div>
              <div className="tl-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
