import { TabsActivation, TabsHash, TabsOrientation } from "../../tabs/core.js";
import { ReactElement } from "react";
export interface InstallOption {
  /** Stable and id-safe: it becomes the tab value and part of the panel id. */
  readonly id: string;
  /** The tab text, such as "npm". */
  readonly label: string;
  readonly command: string;
  /** A line shown under the command. */
  readonly note?: string;
}
export interface InstallTabsLabels {
  /** The tablist's accessible name. Default "Install with". */
  readonly tabList?: string;
  /** The glyph before each command, hidden from assistive tech. Default "$"; "" for none. */
  readonly prompt?: string;
  /** The idle button text. Default "Copy". */
  readonly copy?: string;
  /** The button text after a successful copy. Default "Copied". */
  readonly copied?: string;
  /** Announced after a successful copy. Default "Copied to clipboard." */
  readonly copiedMessage?: string;
  /** Shown and announced when copying fails. */
  readonly failed?: string;
}
export interface InstallTabsProps {
  readonly options: readonly InstallOption[];
  /** Called after every copy attempt with the option's id and whether it worked. */
  readonly onCopy?: (id: string, ok: boolean) => void;
  readonly labels?: InstallTabsLabels;
  /** How long the copied state lasts. Default 2000. */
  readonly resetMs?: number;
  /** The selected option's id (controlled). */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (id: string) => void;
  readonly activation?: TabsActivation;
  /** Default "horizontal". */
  readonly orientation?: TabsOrientation;
  /** Keep every panel rendered after hydration. Default true. See `Tabs`. */
  readonly keepMounted?: boolean;
  /** Render tabs as anchors. Default true. See `Tabs`. */
  readonly asAnchors?: boolean;
  readonly hash?: TabsHash;
  readonly eventName?: string;
  /** The id prefix for tabs and panels; pass a stable one for deep links. */
  readonly id?: string;
  readonly className?: string;
}
/**
 * Install commands in tabs, one per package manager or platform, each with a copy button.
 * Without JavaScript every command is in the HTML and reachable through the tab links; the copy
 * buttons stay hidden until hydration so there's no dead control.
 */
export declare function InstallTabs({ options, onCopy, labels, resetMs, value, defaultValue, onValueChange, activation, orientation, keepMounted, asAnchors, hash, eventName, id, className }: InstallTabsProps): ReactElement | null;