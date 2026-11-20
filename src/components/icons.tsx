import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Base {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Base>;
export const IconInbox = (p: P) => <Base {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></Base>;
export const IconBell = (p: P) => <Base {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></Base>;
export const IconCalendar = (p: P) => <Base {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Base>;
export const IconReceipt = (p: P) => <Base {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Base>;
export const IconUsers = (p: P) => <Base {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 5.5 5" /></Base>;
export const IconChart = (p: P) => <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>;
export const IconSettings = (p: P) => <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Base>;
export const IconWallet = (p: P) => <Base {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /><path d="M6 6V4h12v2" /></Base>;
export const IconClock = (p: P) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>;
export const IconAlert = (p: P) => <Base {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></Base>;
export const IconCheck = (p: P) => <Base {...p}><path d="m5 12 4.5 4.5L19 7" /></Base>;
export const IconX = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const IconPlus = (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconDownload = (p: P) => <Base {...p}><path d="M12 4v11M7 10l5 5 5-5M4 20h16" /></Base>;
export const IconLogout = (p: P) => <Base {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Base>;
export const IconSearch = (p: P) => <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Base>;
export const IconUser = (p: P) => <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Base>;
export const IconFile = (p: P) => <Base {...p}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></Base>;
export const IconChevron = (p: P) => <Base {...p}><path d="m9 6 6 6-6 6" /></Base>;
export const IconChevronLeft = (p: P) => <Base {...p}><path d="m15 6-6 6 6 6" /></Base>;
export const IconShield = (p: P) => <Base {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></Base>;

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#0875e1" />
      <path d="M7 19a9 9 0 0 1 18 0" fill="none" stroke="#ffc629" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="16" cy="19" r="2.6" fill="#fff" />
    </svg>
  );
}
