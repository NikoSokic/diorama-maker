import type { ReactNode } from 'react'

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const PlayIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8.2 4.6c-1-.6-2.2.1-2.2 1.300v12.200c0 1.200 1.200 1.900 2.200 1.300l10.300-6.100c1-.6 1-2 0-2.600z" />
  </Icon>
)

export const PauseIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="5.500" y="4.500" width="4.600" height="15" rx="1.600" />
    <rect x="13.900" y="4.500" width="4.600" height="15" rx="1.600" />
  </Icon>
)

export const PreviousIcon = () => (
  <Icon>
    <rect x="4.500" y="5.500" width="3" height="13" rx="1.300" />
    <path d="M19.500 6.700c0-1-1.100-1.600-1.900-1L10 11c-.7.500-.7 1.500 0 2l7.600 5.300c.8.600 1.900 0 1.900-1z" />
  </Icon>
)

export const NextIcon = () => (
  <Icon>
    <rect x="16.500" y="5.500" width="3" height="13" rx="1.300" />
    <path d="M4.500 6.700c0-1 1.100-1.600 1.900-1L14 11c.7.500.7 1.500 0 2l-7.600 5.300c-.8.600-1.900 0-1.900-1z" />
  </Icon>
)

export const RestartIcon = () => (
  <Icon>
    <path {...stroke} d="M4.500 12a7.500 7.500 0 1 0 2.400-5.500" />
    <path {...stroke} d="M4.300 3.800v3.900h3.900" />
  </Icon>
)

export const SoundOnIcon = () => (
  <Icon>
    <path d="M11.500 5.300c0-.9-1-1.300-1.700-.8L6.200 7.800H4.300c-.7 0-1.300.6-1.300 1.300v5.800c0 .7.600 1.300 1.300 1.300h1.900l3.600 3.300c.7.500 1.700.100 1.700-.8z" />
    <path {...stroke} d="M15.300 9.200a4 4 0 0 1 0 5.600M17.900 6.600a7.600 7.600 0 0 1 0 10.800" />
  </Icon>
)

export const SoundOffIcon = () => (
  <Icon>
    <path d="M11.500 5.300c0-.9-1-1.300-1.700-.8L6.200 7.800H4.300c-.7 0-1.300.6-1.300 1.300v5.800c0 .7.600 1.300 1.300 1.300h1.900l3.600 3.300c.7.500 1.700.100 1.700-.8z" />
    <path {...stroke} d="m15.600 9.600 4.800 4.800m0-4.800-4.800 4.800" />
  </Icon>
)

export const CameraIcon = () => (
  <Icon>
    <path d="M9.200 4.500c-.5 0-.9.200-1.100.6L7.200 6.500H5.300A2.300 2.300 0 0 0 3 8.800v8.400a2.300 2.300 0 0 0 2.300 2.300h13.400a2.300 2.300 0 0 0 2.300-2.300V8.800a2.300 2.300 0 0 0-2.300-2.300h-1.900l-.9-1.400c-.2-.4-.6-.6-1.100-.6zM12 9.500a3.500 3.500 0 1 1 0 7 3.500 3.500 0 0 1 0-7z" />
  </Icon>
)

export const ShareIcon = () => (
  <Icon>
    <path {...stroke} d="M12 15V4.500m0 0L8.300 8.200M12 4.500l3.700 3.700M5.500 12.500v5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5" />
  </Icon>
)

export const LinkIcon = () => (
  <Icon>
    <path {...stroke} d="M10.200 13.800a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M13.800 10.200a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
  </Icon>
)

export const FullscreenIcon = () => (
  <Icon>
    <path {...stroke} d="M4.500 9V5.500a1 1 0 0 1 1-1H9M15 4.500h3.500a1 1 0 0 1 1 1V9M19.500 15v3.500a1 1 0 0 1-1 1H15M9 19.500H5.500a1 1 0 0 1-1-1V15" />
  </Icon>
)
