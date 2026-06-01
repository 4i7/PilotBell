import type { ReactElement, SVGProps } from "react";

export type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9.7 3.4h4.6l.5 2.1c.5.2 1 .5 1.4.8l2-.7l2.3 4l-1.6 1.4v2l1.6 1.4l-2.3 4l-2-.7c-.4.3-.9.6-1.4.8l-.5 2.1H9.7l-.5-2.1c-.5-.2-1-.5-1.4-.8l-2 .7l-2.3-4L5.1 13v-2L3.5 9.6l2.3-4l2 .7c.4-.3.9-.6 1.4-.8l.5-2.1Z" />
      <circle cx="12" cy="12" r="3.2" />
    </IconBase>
  );
}

export function AttachIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m12 18V6" />
      <path d="m7 11l5-5l5 5" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 9l6 6l6-6" />
    </IconBase>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.4" />
      <path d="M12 19.6V22" />
      <path d="m4.9 4.9l1.7 1.7" />
      <path d="m17.4 17.4l1.7 1.7" />
      <path d="M2 12h2.4" />
      <path d="M19.6 12H22" />
      <path d="m4.9 19.1l1.7-1.7" />
      <path d="m17.4 6.6l1.7-1.7" />
    </IconBase>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M14.5 3.8a7.5 7.5 0 1 0 5.7 10.8a8.8 8.8 0 1 1-5.7-10.8Z" />
    </IconBase>
  );
}

export function MonitorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="11.5" rx="2.4" />
      <path d="M9 19h6" />
      <path d="M12 16.5V19" />
    </IconBase>
  );
}

export function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M6 12h12" />
    </IconBase>
  );
}

export function SquareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </IconBase>
  );
}

export function RestoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 6.5h8.5V15" />
      <path d="M15 9h-8.5v8.5H15" />
    </IconBase>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 6l12 12" />
      <path d="m18 6l-12 12" />
    </IconBase>
  );
}
