import { marked } from "marked";
import { useMemo } from "react";

// Configure marked: no async, no pedantic
marked.setOptions({ async: false, pedantic: false });

/**
 * Renders markdown content as HTML.
 * Only for trusted content (AI-generated text, no user HTML injection risk).
 */
export function Md({
  children,
  compact = false,
  style,
}: {
  children: string;
  /** compact=true uses tighter spacing (for activity feed snippets) */
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const html = useMemo(() => {
    if (!children) return "";
    return marked.parse(children) as string;
  }, [children]);

  return (
    <>
      <style>{MD_STYLES}</style>
      <div
        className={compact ? "md md-compact" : "md"}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
        style={style}
      />
    </>
  );
}

const MD_STYLES = `
.md {
  font-size: inherit;
  color: inherit;
  line-height: var(--leading-normal, 1.6);
  word-break: break-word;
  min-width: 0;
}
.md p { margin: 0 0 0.5em 0; }
.md p:last-child { margin-bottom: 0; }
.md strong { font-weight: 700; }
.md em { font-style: italic; }
.md h1, .md h2, .md h3, .md h4 {
  font-weight: 700;
  margin: 0.75em 0 0.25em 0;
  line-height: 1.3;
}
.md h1 { font-size: 1.15em; }
.md h2 { font-size: 1.05em; }
.md h3, .md h4 { font-size: 1em; }
.md h1:first-child, .md h2:first-child, .md h3:first-child { margin-top: 0; }
.md ul, .md ol {
  margin: 0.4em 0 0.4em 1.2em;
  padding: 0;
}
.md li { margin: 0.15em 0; }
.md code {
  font-family: ui-monospace, monospace;
  font-size: 0.88em;
  background: var(--bg-base, rgba(0,0,0,0.12));
  border-radius: 3px;
  padding: 0.1em 0.3em;
}
.md pre {
  background: var(--bg-base, rgba(0,0,0,0.12));
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 6px;
  padding: 0.75em 1em;
  overflow-x: auto;
  margin: 0.5em 0;
}
.md pre code { background: none; padding: 0; font-size: 0.85em; }
.md blockquote {
  border-left: 3px solid var(--border, rgba(255,255,255,0.2));
  margin: 0.5em 0;
  padding: 0.25em 0 0.25em 0.75em;
  color: var(--text-secondary, inherit);
}
.md hr { border: none; border-top: 1px solid var(--border); margin: 0.75em 0; }
.md a { color: var(--accent-agent, #7b61ff); text-decoration: underline; }
.md table { border-collapse: collapse; width: 100%; font-size: 0.9em; margin: 0.5em 0; }
.md th, .md td { border: 1px solid var(--border); padding: 4px 8px; }
.md th { font-weight: 600; background: var(--bg-base); }

/* Compact variant: minimal spacing for activity feed */
.md-compact p { margin: 0 0 0.2em 0; }
.md-compact ul, .md-compact ol { margin: 0.2em 0 0.2em 1em; }
.md-compact h1, .md-compact h2, .md-compact h3 { margin: 0.3em 0 0.1em; }
.md-compact pre { margin: 0.3em 0; padding: 0.4em 0.6em; }
`;
