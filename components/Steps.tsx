import { Icon } from "./Icon";

export function Steps() {
  return (
    <section id="how">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">How it works</div>
          <h2>Three steps. Ninety seconds.</h2>
        </div>
        <div className="steps">
          <div className="step reveal">
            <div className="ic-wrap">
              <Icon name="botmsg" />
            </div>
            <h3>Open the bot</h3>
            <p>
              Tap “Start on Telegram”. Your account is created instantly — no
              forms, no password, no email.
            </p>
          </div>
          <div className="step reveal">
            <div className="ic-wrap">
              <Icon name="shield" />
            </div>
            <h3>Connect your tools</h3>
            <p>
              One-tap “Log in with GitHub / Vercel”. Credentials are AES-256
              encrypted and never shown back.
            </p>
          </div>
          <div className="step reveal">
            <div className="ic-wrap">
              <Icon name="flash" />
            </div>
            <h3>Just ask</h3>
            <p>
              “Create a repo.” “Deploy it.” “What happened today?” Tandem does
              the rest — and confirms before anything breaks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
