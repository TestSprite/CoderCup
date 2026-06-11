import { TestsClient } from './TestsClient';

export const metadata = {
  title: 'Test suite — world-cup-2026-v3 phase 1 · CoderCup',
  description:
    'The 50-plan TestSprite suite that scores every CoderCup deployable. Open source, browseable, PR-able. Each plan is a structured natural-language test that runs against the deployed URL with a real headless browser.',
};

export default function TestsPage() {
  return <TestsClient />;
}
