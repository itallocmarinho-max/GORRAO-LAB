import { cyberKicker, cyberHeadingTitle, cyberHeadingSubtitle } from "@/lib/cyber-ui";

interface Props {
  kicker?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function CyberHeading({ kicker, title, subtitle, right }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {kicker && <div className={cyberKicker}>// {kicker}</div>}
        <h1 className={cyberHeadingTitle}>{title}</h1>
        {subtitle && <p className={cyberHeadingSubtitle}>{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}