import { AgentDetailClient } from './AgentDetailClient';
import { promises as fs } from 'fs';
import path from 'path';

const FALLBACK_SLUGS = ['claude-code', 'codex', 'antigravity', 'kimi'] as const;

export async function generateStaticParams() {
  // Read leaderboard.json at build time and generate a static page per agent.
  // Fallback to known slugs if the fixture isn't readable for any reason.
  try {
    const fixturePath = path.join(
      process.cwd(),
      'public',
      'fixtures',
      'leaderboard.json',
    );
    const raw = await fs.readFile(fixturePath, 'utf-8');
    const data = JSON.parse(raw) as { rankings?: Array<{ agent_slug: string }> };
    const slugs = data.rankings?.map((r) => r.agent_slug) ?? [];
    if (slugs.length > 0) return slugs.map((slug) => ({ slug }));
  } catch {
    // fall through to fallback
  }
  return FALLBACK_SLUGS.map((slug) => ({ slug }));
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AgentDetailClient slug={slug} />;
}
