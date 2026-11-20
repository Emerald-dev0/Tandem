import { Icon } from "./Icon";

/** Light-mode Telegram chat with a real Tandem conversation. */
export function PhoneMock() {
  return (
    <div className="phone">
      <div className="tg-head">
        <div className="tg-avatar">
          <Icon name="tg" />
        </div>
        <div>
          <div className="tg-name">
            Tandem <span className="bot-tag">BOT</span>
          </div>
          <div className="tg-status">bot · replies instantly</div>
        </div>
      </div>
      <div className="tg-chat">
        <div className="bub user">list my repos</div>
        <div className="bub bot">
          <b>Your repositories — page 1</b>
          <div className="rowlist">
            <div className="repo-row">
              <span className="nm">
                <Icon name="lock" /> octo/calder-api
              </span>
              <span className="muted">2h</span>
            </div>
            <div className="repo-row">
              <span className="nm">
                <Icon name="globe" /> octo/portfolio
              </span>
              <span className="muted">1d</span>
            </div>
            <div className="repo-row">
              <span className="nm">
                <Icon name="lock" /> octo/billing-svc
              </span>
              <span className="muted">3d</span>
            </div>
          </div>
          <div className="mini-btn">
            <Icon name="arrow" /> Show more
          </div>
        </div>
        <div className="bub user">deploy my-app to vercel</div>
        <div className="bub bot">
          <b>Deployment started</b>
          <br />
          <span style={{ color: "#1D83C8", fontWeight: 700 }}>
            my-app.vercel.app
          </span>
          <br />
          <span className="muted">state: BUILDING → LIVE</span>
          <div className="mini-btn">
            <Icon name="rocket" /> Deployment details
          </div>
        </div>
      </div>
    </div>
  );
}
