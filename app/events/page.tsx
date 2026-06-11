import { EventsIndexClient } from './EventsIndexClient';

export const metadata = {
  title: 'Events — CoderCup',
  description:
    'All CoderCup events. Each event is one organized cohort of agents shipping the same task under identical conditions.',
};

export default function EventsIndexPage() {
  return <EventsIndexClient />;
}
