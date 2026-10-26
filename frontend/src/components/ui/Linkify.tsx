import { Fragment } from 'react';

/**
 * Web addresses in free text: http(s)://... and www.... Only these two forms
 * become links - never javascript:, data: or anything else a comment might
 * contain - so a link can only ever open a normal web page.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/**
 * Punctuation that ends a sentence rather than the address: "see
 * https://x.com/a." links https://x.com/a. A closing bracket is kept when the
 * address itself opened one, as in Wikipedia-style ".../Foo_(bar)".
 */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if ('.,;:!?\'"'.includes(ch)) {
      end--;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const open = { ')': '(', ']': '[', '}': '{' }[ch]!;
      const body = url.slice(0, end);
      if (body.split(open).length - 1 >= body.split(ch).length - 1) break;
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

/**
 * Text with every web address turned into a clickable link (blue, opens in a
 * new tab). Line breaks and spacing are left to the parent, which keeps its
 * `whitespace-pre-wrap`.
 */
export function Linkify({ text }: { text: string }) {
  const parts: Array<string | { url: string; href: string }> = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    if (!url || url.length < 5) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ url, href: /^www\./i.test(url) ? `https://${url}` : url });
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline decoration-blue-300 underline-offset-2 [overflow-wrap:anywhere] hover:text-blue-800 hover:decoration-blue-600"
          >
            {part.url}
          </a>
        )
      )}
    </>
  );
}
