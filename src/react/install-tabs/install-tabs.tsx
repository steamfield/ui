import { type ReactElement, useEffect, useRef, useState } from "react";
import { DEFAULT_COPY_MESSAGES } from "../../copy/messages.ts";
import { defined } from "../../internal/options.ts";
import type { TabsActivation, TabsHash, TabsOrientation } from "../../tabs/core.ts";
import { useCopy } from "../copy/use-copy.ts";
import { Tab, TabList, TabPanel, Tabs } from "../tabs/tabs.tsx";

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

const DEFAULT_LABELS: Required<InstallTabsLabels> = {
  tabList: "Install with",
  prompt: "$",
  copy: DEFAULT_COPY_MESSAGES.label,
  copied: DEFAULT_COPY_MESSAGES.copiedLabel,
  copiedMessage: DEFAULT_COPY_MESSAGES.copied,
  // Differs from the enhancer's on purpose: nothing gets selected here (see copy/messages.ts).
  failed: "Copy failed. Select the command and copy it manually.",
};

/**
 * Install commands in tabs, one per package manager or platform, each with a copy button.
 * Without JavaScript every command is in the HTML and reachable through the tab links; the copy
 * buttons stay hidden until hydration so there's no dead control.
 */
export function InstallTabs({
  options,
  onCopy,
  labels,
  resetMs,
  value,
  defaultValue,
  onValueChange,
  activation,
  orientation,
  keepMounted,
  asAnchors,
  hash,
  eventName,
  id,
  className,
}: InstallTabsProps): ReactElement | null {
  const text = { ...DEFAULT_LABELS, ...labels };
  const { copied, failed, copy } = useCopy(resetMs === undefined ? {} : { resetMs });
  const [internal, setInternal] = useState(defaultValue ?? options[0]?.id);
  const active = value ?? internal;
  // Which option the current copy result belongs to; cleared on a tab switch.
  const [resultFor, setResultFor] = useState<string | null>(null);
  const activeRef = useRef(active);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (options.length === 0) return null;

  const switchTo = (next: string): void => {
    if (value === undefined) setInternal(next);
    setResultFor(null);
    onValueChange?.(next);
  };
  const copyOption = async (option: InstallOption): Promise<void> => {
    const ok = await copy(option.command);
    // A result that lands after the reader moved on belongs to a tab no longer shown.
    if (activeRef.current === option.id) setResultFor(option.id);
    onCopy?.(option.id, ok);
  };
  const state = (option: InstallOption): "copied" | "failed" | undefined => {
    if (resultFor !== option.id) return undefined;
    if (copied) return "copied";
    return failed ? "failed" : undefined;
  };
  const current = options.find((option) => option.id === active) ?? options[0];
  activeRef.current = current?.id;
  const result = current ? state(current) : undefined;
  const optional = defined({
    activation,
    orientation,
    keepMounted,
    asAnchors,
    hash,
    eventName,
    id,
  });

  return (
    <div className={className} data-part="install-tabs">
      <Tabs {...optional} value={current?.id ?? ""} onValueChange={switchTo}>
        <TabList aria-label={text.tabList}>
          {options.map((option) => (
            <Tab key={option.id} value={option.id}>
              {option.label}
            </Tab>
          ))}
        </TabList>
        {options.map((option) => (
          <TabPanel key={option.id} value={option.id}>
            <div data-part="install-command">
              <code data-part="command">
                {text.prompt ? (
                  <span aria-hidden="true" data-part="prompt" style={{ userSelect: "none" }}>
                    {text.prompt}{" "}
                  </span>
                ) : null}
                {option.command}
              </code>
              <button
                type="button"
                hidden={!hydrated}
                data-part="copy-button"
                data-state={state(option)}
                onClick={() => {
                  void copyOption(option);
                }}
              >
                {state(option) === "copied" ? text.copied : text.copy}
              </button>
            </div>
            {option.note ? <p data-part="install-note">{option.note}</p> : null}
          </TabPanel>
        ))}
      </Tabs>
      <span data-part="copy-result" data-state={result} role="status" aria-live="polite">
        {result === "copied" ? text.copiedMessage : null}
        {result === "failed" ? text.failed : null}
      </span>
    </div>
  );
}
