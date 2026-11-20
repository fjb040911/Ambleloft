import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "./components/ui/bubble";

const userBubbleClassName = "max-w-[90%] max-[800px]:max-w-[96%] *:data-[slot=bubble-content]:bg-message *:data-[slot=bubble-content]:text-message-foreground *:data-[slot=bubble-content]:border-0 *:data-[slot=bubble-content]:rounded-(--radius-message) *:data-[slot=bubble-content]:px-(--message-padding-inline) *:data-[slot=bubble-content]:py-(--message-padding-block) *:data-[slot=bubble-content]:text-[.9375rem] *:data-[slot=bubble-content]:leading-normal *:data-[slot=bubble-content]:font-medium";

export default function ChatBubble({ user, children }: { user: boolean; children: ReactNode }) {
  return (
    <Bubble align={user ? "end" : "start"} variant={user ? "default" : "ghost"} className={user ? userBubbleClassName : undefined}>
      <BubbleContent>{children}</BubbleContent>
    </Bubble>
  );
}
