import { LiveClient } from './LiveClient';

export const metadata = {
  title: 'Live · CoderCup',
  description:
    'CoderCup right now — active state shows N agents shipping in parallel; idle state shows the most-recent event + the next-event countdown.',
};

export default function LivePage() {
  return <LiveClient />;
}
