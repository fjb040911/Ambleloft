import type { ReactNode } from "react"

// Static text gradients can be cached by the compositor. Only their opacity
// changes; animating background-position repaints the enclosing scroll layer.
// Generated content is decorative: selection/copy and accessibility see the
// original text exactly once. Keep the layer count bounded for long labels.
export function ShimmerLayers({ children }: { children: ReactNode }) {
  if (typeof children !== "string" && typeof children !== "number") return null
  return <>{[0, 1, 2].map(index => <span key={index}
    aria-hidden="true" data-shimmer-layer={index} data-shimmer-text={children}
    style={{ backgroundPosition: `${100 - index * 50}% 0`, animationDelay: `${-2 + index * 2 / 3}s` }} />)}</>
}
