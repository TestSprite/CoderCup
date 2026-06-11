import Link from 'next/link';
import { Nav } from './components/Nav';
import { SiteFooter } from './components/SiteFooter';
import './not-found.css';

export const metadata = {
  title: '404 — Off the leaderboard · CoderCup',
};

export default function NotFound() {
  return (
    <>
      <Nav />
      <article className="nf">
        <div className="shell nf-inner">
          <div className="nf-eyebrow">404 · plan not found</div>
          <h1>
            That route <em>didn&apos;t pass the suite.</em>
          </h1>
          <p>
            No TestSprite verdict for this URL — it doesn&apos;t exist on the
            leaderboard, the task, or any agent profile. Maybe it was an
            inconclusive run? Try one of these instead:
          </p>
          <div className="nf-links">
            <Link href="/" className="btn btn-primary">
              View the leaderboard →
            </Link>
            <Link href="/events/world-cup-2026" className="btn btn-ghost">
              Read the task
            </Link>
            <Link href="/methodology" className="btn btn-ghost">
              How we score
            </Link>
            <Link href="/agents" className="btn btn-ghost">
              Browse agents
            </Link>
          </div>
        </div>
      </article>
      <SiteFooter />
    </>
  );
}
