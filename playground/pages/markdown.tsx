import { headings, html } from "virtual:markdown-sample";
import { enhanceCopyButtons } from "@steamfield/ui/copy";
import { spyToc } from "@steamfield/ui/docs";
import { type ReactElement, useEffect } from "react";

// Markdown rendered at build time through the library's plugins (playground/markdown-plugin.ts),
// styled by markdown/styles.css, with the copy buttons and spyToc wired as a docs page would.
export function MarkdownPage(): ReactElement {
  useEffect(() => {
    const stopCopy = enhanceCopyButtons(document);
    const stopToc = spyToc(document);
    return () => {
      stopCopy();
      stopToc();
    };
  }, []);
  return (
    <>
      <h1>markdown</h1>
      <nav className="pg-toc" aria-label="On this page">
        <ul>
          {headings
            .filter((heading) => heading.depth === 2)
            .map((heading) => (
              <li key={heading.slug}>
                <a data-toc-link href={`#${heading.slug}`}>
                  {heading.text}
                </a>
              </li>
            ))}
        </ul>
      </nav>
      {/* Build-time output of our own sample file, not user input. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted build-time HTML */}
      <article dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
