import { Icon } from "./Icon";

const ROW_A = [
  { icon: "foldergit", cmd: "list my repos" },
  { icon: "rocket", cmd: "deploy my-app to vercel" },
  { icon: "alert", cmd: "make octo/blog public" },
  { icon: "sun", cmd: "what shipped today?" },
  { icon: "cancel", cmd: "cancel deployment dpl_8f2" },
  { icon: "globe", cmd: "show dns for example.com" },
];
const ROW_B = [
  { icon: "star", cmd: "star calder-api" },
  { icon: "flash", cmd: "run the diagnose workflow" },
  { icon: "eye", cmd: "watch portfolio" },
  { icon: "cmd", cmd: "logs for billing-svc" },
  { icon: "gitbranch", cmd: "merge pull request 24" },
  { icon: "activity", cmd: "deployment status" },
];

function Track({ items }: { items: typeof ROW_A }) {
  const loop = [...items, ...items];
  return (
    <div className="mq-track">
      {loop.map((it, i) => (
        <span className="mq-item" key={i}>
          <Icon name={it.icon} />
          <span className="p">&gt;</span> {it.cmd}
        </span>
      ))}
    </div>
  );
}

export function Marquee() {
  return (
    <div className="marquee-sec">
      <div className="marquee">
        <Track items={ROW_A} />
      </div>
      <div className="marquee rev">
        <Track items={ROW_B} />
      </div>
    </div>
  );
}
