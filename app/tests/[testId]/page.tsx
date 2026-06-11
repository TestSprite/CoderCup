import { promises as fs } from 'fs';
import path from 'path';
import { TestDetailClient } from './TestDetailClient';
import { TESTS } from '../data';

export function generateStaticParams() {
  return TESTS.map((t) => ({ testId: t.test_id }));
}

export async function generateMetadata({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const t = TESTS.find((x) => x.test_id === testId);
  return {
    title: t ? `${t.name} — TestSprite plan · CoderCup` : 'Plan — CoderCup',
    description: t
      ? `How each agent fared on TestSprite plan ${t.test_id} (phase ${t.phase} · ${t.category}). Plan source, per-agent verdicts, and deployed-app previews.`
      : 'TestSprite plan not found.',
  };
}

async function readPlanSource(planPath: string, phase: number): Promise<unknown> {
  // Plan JSONs live under tests/world-cup-2026-v3/phase-<N>/. Phases 1-6
  // are scored; phases 7-9 land just-in-time per the multi-phase spec, and
  // this loader will start finding them as soon as data.ts adds entries
  // with phase: 7+.
  try {
    const fp = path.join(
      process.cwd(),
      'tests',
      'world-cup-2026-v3',
      `phase-${phase}`,
      planPath,
    );
    const raw = await fs.readFile(fp, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function TestDetailPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  const plan = TESTS.find((t) => t.test_id === testId);
  const planSource = plan ? await readPlanSource(plan.path, plan.phase) : null;
  return <TestDetailClient testId={testId} planSource={planSource} />;
}
