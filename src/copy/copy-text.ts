/**
 * Copies `text` to the clipboard and reports whether it worked. Tries the async Clipboard API
 * first, then a hidden readonly textarea with `execCommand("copy")`, whose result is respected.
 * Never throws, so callers branch on the boolean instead of wrapping every call.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or an insecure context: fall through to the legacy path.
    }
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.execCommand !== "function") return false;
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  doc.body.append(area);
  const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  try {
    area.select();
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus();
  }
}
