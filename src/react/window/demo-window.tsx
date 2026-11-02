import type { CSSProperties, ReactElement, ReactNode } from "react";

export interface DemoWindowProps {
  /** Text in the title bar. Not a heading: put the section's heading outside the window. */
  readonly title?: ReactNode;
  /** Three decorative traffic-light dots. Default true. */
  readonly dots?: boolean;
  /** Right-aligned title-bar content, such as play controls. */
  readonly controls?: ReactNode;
  /** Names the window, which then renders as a `<section>` region. Without it the window has no role. */
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

/**
 * Optional window chrome for a demo: dots, a title and a controls slot over a body. It renders no
 * heading element; the consumer supplies one.
 */
export function DemoWindow({
  title,
  dots = true,
  controls,
  label,
  className,
  style,
  children,
}: DemoWindowProps): ReactElement {
  // A labelled window is a region landmark; an unlabelled one is a plain box.
  const Root = label ? "section" : "div";
  return (
    <Root data-part="window" className={className} style={style} aria-label={label}>
      <div data-part="window-bar">
        {dots ? (
          <span data-part="window-dots" aria-hidden="true">
            <span data-part="window-dot" />
            <span data-part="window-dot" />
            <span data-part="window-dot" />
          </span>
        ) : null}
        {title !== undefined ? <span data-part="window-title">{title}</span> : null}
        {controls ? <div data-part="window-controls">{controls}</div> : null}
      </div>
      <div data-part="window-body">{children}</div>
    </Root>
  );
}
