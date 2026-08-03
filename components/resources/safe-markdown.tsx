import { Fragment, type ReactNode } from "react";

/** Deliberately small renderer: text is escaped; only allowlisted blocks and HTTP(S) links are interpreted. */
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
  const normalizedBody = body.replace(/\r\n?/g, "\n");
  return (
    <div className="space-y-4 whitespace-pre-wrap break-words text-base leading-7">
      {normalizedBody.split(/\n{2,}/).map((block, index) => (
        <Fragment key={index}>{renderBlock(block)}</Fragment>
      ))}
    </div>
  );
}

function renderBlock(block: string): ReactNode {
  const heading = /^(#{1,6})\s+([^]*)$/.exec(block);
  if (heading) {
    const content = <SafeInline value={heading[2]} />;
    switch (heading[1].length) {
      case 1:
        return <h2 className="text-2xl font-semibold">{content}</h2>;
      case 2:
        return <h3 className="text-xl font-semibold">{content}</h3>;
      case 3:
        return <h4 className="text-lg font-semibold">{content}</h4>;
      case 4:
        return <h5 className="font-semibold">{content}</h5>;
      default:
        return <h6 className="font-semibold">{content}</h6>;
    }
  }

  const fencedCode = /^```[^\n]*\n([^]*)\n```$/.exec(block);
  if (fencedCode) {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted p-4">
        <code>{fencedCode[1]}</code>
      </pre>
    );
  }

  const lines = block.split("\n");
  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul className="list-disc space-y-1 pl-6">
        {lines.map((line, index) => (
          <li key={index}>
            <SafeInline value={line.replace(/^[-*]\s+/, "")} />
          </li>
        ))}
      </ul>
    );
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return (
      <ol className="list-decimal space-y-1 pl-6">
        {lines.map((line, index) => (
          <li key={index}>
            <SafeInline value={line.replace(/^\d+\.\s+/, "")} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p>
      <SafeInline value={block} />
    </p>
  );
}
