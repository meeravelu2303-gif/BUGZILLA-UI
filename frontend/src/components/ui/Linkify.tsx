import { Fragment } from 'react';

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const lastCharacter = url[end - 1];
    if ('.,;:!?\'"'.includes(lastCharacter)) {
      end--;
    } else if (lastCharacter === ')' || lastCharacter === ']' || lastCharacter === '}') {
      const open = { ')': '(', ']': '[', '}': '{' }[lastCharacter]!;
      const body = url.slice(0, end);
      if (body.split(open).length - 1 >= body.split(lastCharacter).length - 1) break;
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

/** Text with every web address turned into a clickable link (blue, opens in a new tab). */
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
        ),
      )}
    </>
  );
}
