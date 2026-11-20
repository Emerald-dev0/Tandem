import { Icon } from "./Icon";

function ThreadMock() {
  return (
    <div className="mock m-thread">
      <div className="t-head">
        <div className="av">
          <Icon name="tg" />
        </div>
        <div>
          <div className="nm">Tandem</div>
          <div className="ch"># deploy-bot</div>
        </div>
      </div>
      <div className="t-msg me">create a private repo called calder-api</div>
      <div className="t-msg it">
        Running: create a private repo called calder-api…
        <div className="ok">
          <Icon name="check" /> Repository created · octo/calder-api
        </div>
      </div>
      <div className="t-input">
        <span>Message Tandem…</span>
        <Icon name="sent" />
      </div>
    </div>
  );
}

function ToolsMock() {
  return (
    <div className="mock m-tools">
      <div className="fan">
        <div className="fc fc1">
          <Icon name="gh" />
        </div>
        <div className="fc fc2">
          <Icon name="vercel" />
        </div>
        <div className="fc fc3">
          <Icon name="tg" />
        </div>
      </div>
      <div className="w-title">Your tools</div>
      <div className="tiles">
        <div className="tile">
          <Icon name="gh" /> GitHub
        </div>
        <div className="tile">
          <Icon name="vercel" /> Vercel
        </div>
        <div className="tile soon">
          <Icon name="cloud" /> Cloudflare <span className="tag">SOON</span>
        </div>
        <div className="tile soon">
          <Icon name="server" /> Render <span className="tag">SOON</span>
        </div>
      </div>
    </div>
  );
}

function ConfirmMock() {
  return (
    <div className="mock m-confirm">
      <div className="c-top">
        <div className="c-ic">
          <Icon name="alert" />
        </div>
        <div>
          <div className="c-t">Make octo/blog public?</div>
          <div className="c-d">
            Anyone on the internet will be able to see this repository and its
            code.
          </div>
        </div>
      </div>
      <div className="c-btns">
        <div className="c-btn danger">Yes, make it public</div>
        <div className="c-btn ghost">Cancel</div>
      </div>
    </div>
  );
}

function DigestMock() {
  return (
    <div className="mock m-digest">
      <div className="d-head">
        <div className="l">
          <Icon name="sun" /> Tandem daily digest
        </div>
        <div className="r">Tue · 08:00</div>
      </div>
      <div className="d-row warn">
        <Icon name="alert" /> <span><b>2 repos</b> need your attention</span>
      </div>
      <div className="d-row">
        <Icon name="rocket" />{" "}
        <span>my-app deployed to production · <b>LIVE</b></span>
      </div>
      <div className="d-row">
        <Icon name="gitbranch" /> <span>PR #24 merged in calder-api</span>
      </div>
      <div className="d-row">
        <Icon name="eye" /> <span>Watching: calder-api, portfolio</span>
      </div>
      <div className="envelope" />
      <div className="env-badge">
        <Icon name="mail" />
      </div>
    </div>
  );
}

function RadarMock() {
  return (
    <div className="radar">
      <div className="arc a1" />
      <div className="arc a2" />
      <div className="arc a3" />
      <div className="core">
        <Icon name="tg" />
      </div>
      <div className="node n-a">
        <Icon name="gh" />
      </div>
      <div className="node n-b">
        <Icon name="rocket" />
      </div>
      <div className="node n-c dim">
        <Icon name="cloud" />
      </div>
      <div className="node n-d dim">
        <Icon name="server" />
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">The product, in your pocket</div>
          <h2>
            Everything you do on the dashboard.{" "}
            <span className="dim">Done in a message.</span>
          </h2>
          <p>
            No new tab. No context switch. Tell Tandem what you need — and watch
            it happen.
          </p>
        </div>

        <div className="bento">
          <div className="cell c4 reveal">
            <span className="num">01</span>
            <div className="cell-vis">
              <ThreadMock />
              <div className="break-chip" style={{ right: 26, bottom: -14 }}>
                <Icon name="check" style={{ color: "#1A9E6B" }} /> Repository
                created <span className="sub">· 1.2s</span>
              </div>
            </div>
            <div className="cell-txt">
              <h3>Write it like a message</h3>
              <p>
                Ask like you&apos;d ask a teammate. Tandem turns plain English
                into real GitHub and Vercel actions — and shows its work, line by
                line.
              </p>
            </div>
          </div>

          <div className="cell c3 reveal" style={{ gridColumn: "span 2" }}>
            <span className="num">02</span>
            <div className="cell-vis">
              <ConfirmMock />
            </div>
            <div className="cell-txt">
              <h3>Safe by default</h3>
              <p>
                Destructive moves always stop at a button — even in plain
                English. Nobody deletes a repo by typo.
              </p>
            </div>
          </div>

          <div className="cell c3 reveal">
            <span className="num">03</span>
            <div className="cell-vis">
              <DigestMock />
              <div className="break-chip" style={{ left: 22, top: -13 }}>
                <Icon name="sun" style={{ color: "#F5B93B" }} /> 08:00{" "}
                <span className="sub">· delivered</span>
              </div>
            </div>
            <div className="cell-txt">
              <h3>The morning brief starts with your repos</h3>
              <p>
                What shipped, what merged, what needs you — one digest before
                your first coffee, problems first.
              </p>
            </div>
          </div>

          <div className="cell c3 reveal" id="roadmap">
            <span className="num">04</span>
            <div className="cell-vis">
              <RadarMock />
              <div className="break-chip tip" style={{ right: -10, top: 52 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: "#22C55E",
                  }}
                />{" "}
                my-app <span className="sub">· LIVE</span>
              </div>
            </div>
            <div className="cell-txt">
              <h3>Every deploy shows its status</h3>
              <p>
                Builds, live URLs, rollbacks, promotions — tracked in the same
                chat. Cloudflare and Render join the map soon.
              </p>
            </div>
          </div>

          <div className="cell cell-dark reveal">
            <span className="num">05</span>
            <div className="cell-vis">
              <ToolsMock />
            </div>
            <div className="cell-txt">
              <h3>Works with what you use</h3>
              <p>
                GitHub and Vercel, one-tap login, every action covered.
              </p>
            </div>
          </div>

          <div className="cell cell-dark reveal">
            <div className="cell-vis" style={{ minHeight: 200 }}>
              <div className="stat-stack">
                <div className="stat-line">
                  <span className="n">1</span>
                  <span className="l">
                    chat replaces the dashboard tab you keep open all day
                  </span>
                </div>
                <div className="stat-line">
                  <span className="n">2</span>
                  <span className="l">
                    platforms woven in today — Cloudflare &amp; Render next
                  </span>
                </div>
                <div className="stat-line">
                  <span className="n">0</span>
                  <span className="l">
                    dashboards to learn. If you can type, you can ship
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="cell cell-dark reveal">
            <span className="num">06</span>
            <div className="cell-vis" style={{ minHeight: 200 }}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <span className="break-chip" style={{ position: "static" }}>
                  <Icon name="cloud" style={{ color: "#60A5FA" }} /> Cloudflare{" "}
                  <span className="sub">· soon</span>
                </span>
                <span className="break-chip" style={{ position: "static" }}>
                  <Icon name="server" style={{ color: "#34D399" }} /> Render{" "}
                  <span className="sub">· soon</span>
                </span>
                <span className="break-chip" style={{ position: "static" }}>
                  <Icon name="radar" style={{ color: "#A78BFA" }} /> Monitoring{" "}
                  <span className="sub">· soon</span>
                </span>
              </div>
            </div>
            <div className="cell-txt">
              <h3>Growing with you</h3>
              <p>
                Every update ships straight into the same chat — nothing new to
                learn.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
