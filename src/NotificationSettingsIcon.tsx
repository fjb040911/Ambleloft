import type {SVGProps} from 'react';

/** Bell and settings cog, drawn on the same 24px grid as the workspace icons. */
export default function NotificationSettingsIcon({size=24,...props}:SVGProps<SVGSVGElement>&{size?:number|string}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M10.5 3.5A5.5 5.5 0 0 0 5 9v4c0 2-1 3-2 4h14c-.8-.8-1.5-1.6-1.8-2.8M8 20a2.2 2.2 0 0 0 4 0"/>
    <path d="m16.3 2 .4 1.2 1.1.6 1.2-.3 1.2 2-.8.9v1.2l.8.9-1.2 2-1.2-.3-1.1.6-.4 1.2H14l-.4-1.2-1.1-.6-1.2.3-1.2-2 .8-.9V6.4l-.8-.9 1.2-2 1.2.3 1.1-.6L14 2Z"/>
    <circle cx="15.15" cy="7" r="1.7"/>
  </svg>;
}
