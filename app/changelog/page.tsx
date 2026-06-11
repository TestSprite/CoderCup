import { ChangelogClient } from './ChangelogClient';

export const metadata = {
  title: 'Changelog — CoderCup',
  description:
    'A reverse-chronological log of platform changes — task spec iterations, new agents onboarded, scoring rubric calibrations, and notable verdicts.',
};

export default function ChangelogPage() {
  return <ChangelogClient />;
}
