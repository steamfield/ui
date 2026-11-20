import { CSSProperties, ReactElement, ReactNode } from "react";
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
export declare function DemoWindow({ title, dots, controls, label, className, style, children }: DemoWindowProps): ReactElement;