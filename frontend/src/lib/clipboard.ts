/**
 * Copy text to the clipboard, and report honestly whether it worked.
 *
 * `navigator.clipboard` is **undefined outside a secure context** - HTTPS or
 * localhost. This app is reached across the LAN at `http://192.168.0.50:5175`,
 * which is neither, so on every machine except the server's own browser the
 * modern API simply is not there. That is not a defensive edge case here; it is
 * the normal path for most of the people using this.
 *
 * The previous call site was `void navigator.clipboard?.writeText(text)`
 * followed by an unconditional "Copied". Optional chaining swallowed the
 * missing API, `void` swallowed a rejected promise, and the button reported
 * success either way - so the copy silently did nothing while insisting it had
 * worked. A control that lies about succeeding is worse than one that fails,
 * because there is nothing to react to.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Present but refused - denied permission, or the document was not
      // focused when the write was attempted. The legacy path below often
      // still succeeds, so fall through rather than giving up here.
    }
  }
  return legacyCopy(text);
}

/**
 * `document.execCommand('copy')` over a temporary textarea.
 *
 * Deprecated, and still the only thing that works on an insecure origin. It is
 * synchronous and must run inside the user-gesture task that triggered it -
 * which is why `copyText` is awaited directly from the click handler and never
 * behind a timer.
 */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  // Must remain rendered and selectable: `display:none`, `visibility:hidden`
  // and `hidden` all make the selection - and therefore the copy - fail.
  // `position:fixed` at the origin keeps it out of the layout so the page does
  // not jump; `opacity:0` hides it without removing it from the render tree.
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.width = '1px';
  area.style.height = '1px';
  area.style.padding = '0';
  area.style.border = 'none';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';

  const previous = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);

  try {
    area.focus({ preventScroll: true });
    area.select();
    // iOS Safari ignores `select()` on a readonly field; an explicit range is
    // what actually marks the text there.
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    // Hand focus back, so copying does not quietly move the caret out of
    // whatever the reader was working in.
    previous?.focus?.();
  }
}
