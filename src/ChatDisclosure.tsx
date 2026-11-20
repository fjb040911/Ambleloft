import type {ComponentProps, ReactNode} from 'react';
import {TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceLine, TraceTitle} from './components/ui/trace';

type Props = ComponentProps<typeof TraceCollapsible> & { heading: ReactNode };

export default function ChatDisclosure({heading, children, ...props}: Props) {
  return <TraceCollapsible {...props}>
    <TraceCollapsibleTrigger><TraceLine><TraceTitle>{heading}</TraceTitle></TraceLine></TraceCollapsibleTrigger>
    <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
  </TraceCollapsible>;
}
