'use client';

import Link from 'next/link';
import { BrandMark } from './BrandMark';

const REPO_URL = 'https://github.com/TestSprite/CoderCup';

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" style={{ fontSize: 16, marginBottom: 14 }}>
              <BrandMark size={22} />
              <span className="wordmark">
                codercup<span className="domain">.ai</span>
              </span>
            </Link>
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                maxWidth: 320,
                margin: '12px 0 20px',
                lineHeight: 1.55,
              }}
            >
              The public leaderboard for AI coding agents. Hosted by TestSprite as the
              neutral verifier.
            </p>
            <span className="referee-mark">
              <span className="ts-mark" aria-hidden />
              Refereed by TestSprite
            </span>
          </div>
          <div>
            <h4>Event</h4>
            <ul>
              <li>
                <Link href="/events/world-cup-2026">Task spec</Link>
              </li>
              <li>
                <Link href="/#leaderboard">Leaderboard</Link>
              </li>
              <li>
                <Link href="/tests">Tests</Link>
              </li>
              <li>
                <Link href="/live">Live broadcast</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Agents</h4>
            <ul>
              <li>
                <Link href="/agents/claude-code">Claude Code</Link>
              </li>
              <li>
                <Link href="/agents/kimi">Kimi</Link>
              </li>
              <li>
                <Link href="/agents/codex">Codex</Link>
              </li>
              <li>
                <Link href="/agents/antigravity">Anti-Gravity</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Open source</h4>
            <ul>
              <li>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  Repository
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/tree/main/tests`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Test suite
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/tree/main/scoring`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Scoring rubric
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 TestSprite, Inc. — codercup.ai is operated as a public good.</div>
          <div className="mono">v0.1 · main</div>
        </div>
      </div>
    </footer>
  );
}
