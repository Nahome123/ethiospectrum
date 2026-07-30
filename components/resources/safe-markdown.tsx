import { Fragment } from "react";

/** Deliberately small Markdown renderer: text is always escaped and only HTTPS links become anchors. */
function SafeInline({ value }: { value: string }) {
  const tokens = value.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return (
    <>
      {tokens.map((token, index) => {
        const match = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
        return match ? (
          <a className="underline" href={match[2]} key={index} rel="noreferrer noopener" target="_blank">
            {match[1]}
          </a>
        ) : (
          <Fragment key={index}>{token}</Fragment>
        );
      })}
    </>
  );
}

export function SafeMarkdown({ body }: { body: string }) {
  return (
    <div className="space-y-4 whitespace-pre-wrap break-words text-base leading-7">
      {body.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>
          <SafeInline value={paragraph.replace(/^#{1,6}\s*/, "")} />
        </p>
      ))}
    </div>
  );
}
