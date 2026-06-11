'use client';

import { useState } from 'react';

interface Props {
  markdown: string;
  truncated?: boolean;
  repoUrl?: string;
}

export function TranscriptEmbed({ markdown, truncated, repoUrl }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!markdown) {
    return <p className="text-xs text-mute">No transcript captured for this run.</p>;
  }

  const preview = markdown.length > 600 ? markdown.slice(0, 600) + '…' : markdown;
  const displayed = expanded ? markdown : preview;

  return (
    <div className="space-y-3">
      <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-surface-2 p-4 text-xs leading-relaxed text-fg">
        {displayed}
      </pre>
      <div className="flex items-baseline justify-between text-xs text-mute">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="underline decoration-mute/40 underline-offset-2 hover:text-fg"
        >
          {expanded ? 'collapse' : 'expand'} transcript
        </button>
        {truncated && repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-mute/40 underline-offset-2 hover:text-fg"
          >
            full transcript on GitHub ↗
          </a>
        )}
      </div>
    </div>
  );
}
