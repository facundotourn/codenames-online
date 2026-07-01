import type { ReactNode } from 'react';

// Set de íconos line-style (trazo `currentColor`, esquinas redondeadas) para
// matchear la identidad "rounded" de la app y reemplazar los emojis del chrome.
type IconProps = { size?: number; className?: string; strokeWidth?: number };

function IconSvg({ size = 18, className, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const GearIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.5 14.3a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.4 1z" />
  </IconSvg>
);

export const SunIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 1.8v2.2M12 20v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.8 12h2.2M20 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </IconSvg>
);

export const MoonIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </IconSvg>
);

export const BellIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </IconSvg>
);

export const TrophyIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H5a2 2 0 0 0 0 4h2.3" />
    <path d="M17 6h2a2 2 0 0 1 0 4h-2.3" />
    <path d="M12 14v4M8.5 21h7M9.5 21a2.5 2.5 0 0 1 5 0" />
  </IconSvg>
);

export const RobotIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V5" />
    <circle cx="12" cy="3.8" r="1.2" />
    <path d="M2 13v2M22 13v2" />
    <circle cx="9.2" cy="13.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="13.4" r="1.15" fill="currentColor" stroke="none" />
  </IconSvg>
);

export const BulbIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M12 3a6 6 0 0 0-3.8 10.6c.5.4.8 1 .8 1.7v.2h6v-.2c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3z" />
    <path d="M9.5 18.5h5M10.5 21h3" />
  </IconSvg>
);

export const WarnIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M12 4 2.6 20a1 1 0 0 0 .9 1.5h17a1 1 0 0 0 .9-1.5L12 4z" />
    <path d="M12 10v4.2" />
    <path d="M12 17.6h.01" />
  </IconSvg>
);

export const HourglassIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M6.5 3.5h11M6.5 20.5h11" />
    <path d="M8 3.5v3l4 5 4-5v-3" />
    <path d="M8 20.5v-3l4-5 4 5v3" />
  </IconSvg>
);

// Jefe de espías: sombrero + anteojos (look "agente secreto").
export const SpyIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M3.5 11.5h17" />
    <path d="M6.5 11.5a5.5 5.5 0 0 1 11 0" />
    <circle cx="8.3" cy="15.4" r="2.4" />
    <circle cx="15.7" cy="15.4" r="2.4" />
    <path d="M10.7 15c.8-.5 1.8-.5 2.6 0" />
  </IconSvg>
);

// Agente / persona.
export const UserIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
  </IconSvg>
);

// Mesa / TV (monitor compartido).
export const TvIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <rect x="3" y="5" width="18" height="11" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </IconSvg>
);

// Espectador (ojo).
export const EyeIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </IconSvg>
);

export const LockIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </IconSvg>
);

export const CloseIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </IconSvg>
);

export const KeyIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="8" cy="8" r="4.3" />
    <path d="M11.1 11.1 20 20" />
    <path d="M16.6 16.6l2.1-2.1M14.4 14.4l1.6-1.6" />
  </IconSvg>
);

// "Nueva" (destello).
export const SparkleIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M12 3l1.7 5.1a2 2 0 0 0 1.2 1.2L20 11l-5.1 1.7a2 2 0 0 0-1.2 1.2L12 19l-1.7-5.1a2 2 0 0 0-1.2-1.2L4 11l5.1-1.7a2 2 0 0 0 1.2-1.2L12 3z" />
  </IconSvg>
);

export const RocketIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </IconSvg>
);

// Sombrero de copa (sorteo del jefe).
export const TopHatIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <path d="M8 4h8v11H8z" />
    <path d="M4 15h16" />
    <path d="M8 12h8" />
  </IconSvg>
);

// Punto sólido (color de equipo).
export const DotIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
  </IconSvg>
);

// Ayuda (signo de pregunta en círculo).
export const HelpIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.3 9.2a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.4-2.7 2.4" />
    <path d="M12 16.8h.01" />
  </IconSvg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <IconSvg {...p}><path d="M15 6l-6 6 6 6" /></IconSvg>
);

export const CheckIcon = (p: IconProps) => (
  <IconSvg {...p}><path d="M5 13l4 4L19 7" /></IconSvg>
);

export const CopyIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </IconSvg>
);

// Compartir (3 nodos conectados, estilo Android/Material).
export const ShareIcon = (p: IconProps) => (
  <IconSvg {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </IconSvg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <IconSvg {...p}><path d="M9 6l6 6-6 6" /></IconSvg>
);

// Logo de GitHub (relleno, no line-style).
export const GitHubIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.298-.54-1.497.105-3.121 0 0 1.005-.31 3.3 1.209a11.5 11.5 0 0 1 3-.398c1.02.006 2.04.136 3 .398 2.28-1.519 3.285-1.209 3.285-1.209.645 1.624.24 2.823.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.182 0 1.578-.015 2.846-.015 3.229 0 .309.21.678.825.561C20.565 21.917 24 17.495 24 12.292 24 5.78 18.63.5 12 .5z" />
  </svg>
);
