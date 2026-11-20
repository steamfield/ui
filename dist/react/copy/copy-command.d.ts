import { ReactElement, ReactNode } from "react";
export interface CopyButtonProps {
  /** The `id` of the element whose text the button copies. */
  readonly controls: string;
  /** The accessible name, such as "Copy command". It also picks the noun in failure messages. */
  readonly label?: string;
  /** The visible idle text. Default "Copy". */
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  /** An icon rendered before the label, hidden from assistive tech. */
  readonly icon?: ReactNode;
}
/**
 * A copy button for server-rendered markup. It renders `hidden` with a sibling polite live region;
 * `enhanceCopyButtons()` from `@steamfield/ui/copy` reveals and wires it on the client, so no
 * hydration is needed and a page without JavaScript shows no dead button.
 */
export declare function CopyButton({ controls, label, children, className, icon }: CopyButtonProps): ReactElement;
export interface CopyCommandProps {
  /** A unique id for the command text; the button points at it. */
  readonly id: string;
  readonly command: string;
  /** Render as wrapping prose (a prompt) instead of a one-line command. */
  readonly prose?: boolean;
  /** The prompt glyph before a command. Default "$"; pass null for none. */
  readonly prompt?: string | null;
  readonly label?: string;
  readonly buttonText?: ReactNode;
  /** On the wrapper. */
  readonly className?: string;
  /** On the copy button. */
  readonly buttonClassName?: string | undefined;
  /** On the prompt glyph. */
  readonly promptClassName?: string | undefined;
  /** On the command text. */
  readonly commandClassName?: string | undefined;
  readonly icon?: ReactNode;
}
/** A command (or prompt) the reader can copy. The text stays in the DOM, readable without JS. */
export declare function CopyCommand({ id, command, prose, prompt, label, buttonText, className, buttonClassName, promptClassName, commandClassName, icon }: CopyCommandProps): ReactElement;