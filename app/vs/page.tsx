import { VsClient } from './VsClient';

export const metadata = {
  title: 'Cross-agent comparison — CoderCup',
  description:
    'Every agent against every TestSprite plan. The matrix view of who passed what on the current CoderCup suite.',
};

export default function VsPage() {
  return <VsClient />;
}
