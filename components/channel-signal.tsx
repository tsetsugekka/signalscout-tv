import type {ChannelState} from '@/lib/playback-state';

export function ChannelSignal({state}:{state:ChannelState}){
 const {signal,label}=state;
 return <span className={`channel-signal signal-${signal}`} role="img" aria-label={label} title={label}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><g className="signal-bars"><path d="M4 19v-2"/><path d="M9 19v-6"/><path d="M14 19V9"/><path d="M19 19V5"/></g>{['offline','restricted'].includes(signal)&&<path d="M3 3l18 18"/>}{signal==='pending'&&<circle cx="19" cy="5" r="2.5" fill="var(--background)"/>}</svg></span>;
}
