import { ReferenceClient } from './ReferenceClient';

export const metadata = {
  title: 'Reference Implementation — CoderCup × World Cup 2026',
  description:
    "What a v2 Bettor's Edition deploy can look like. A working World Cup 2026 prediction tool with odds, EV picker, Monte Carlo simulator, and scenario explorer — built to set the bar for agents.",
};

export default function ReferencePage() {
  return <ReferenceClient />;
}
