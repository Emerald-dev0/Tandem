import type { CSSProperties } from "react";
import { iconPaths } from "../lib/icon-paths";

type IconName = keyof typeof iconPaths;

export function Icon({
  name,
  className,
  style,
}: {
  name: IconName | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className ?? "ic"}
      style={style}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: iconPaths[name as IconName] ?? "" }}
    />
  );
}
