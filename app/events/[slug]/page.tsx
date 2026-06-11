import fs from 'node:fs/promises';
import path from 'node:path';
import { EventDetailClient } from './EventDetailClient';
import type { Event, EventsIndex } from '../../lib/api';

export async function generateStaticParams() {
  try {
    const indexPath = path.join(process.cwd(), 'public/fixtures/events.json');
    const raw = await fs.readFile(indexPath, 'utf8');
    const data = JSON.parse(raw) as EventsIndex;
    return data.events.map((e) => ({ slug: e.slug }));
  } catch {
    return [];
  }
}

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps) {
  try {
    const indexPath = path.join(process.cwd(), 'public/fixtures/events.json');
    const raw = await fs.readFile(indexPath, 'utf8');
    const data = JSON.parse(raw) as EventsIndex;
    const event = data.events.find((e) => e.slug === params.slug);
    if (event) {
      return {
        title: `${event.display_name} — CoderCup`,
        description: event.subtitle ?? undefined,
      };
    }
  } catch {}
  return { title: `Event ${params.slug} — CoderCup` };
}

export default async function EventDetailPage({ params }: PageProps) {
  let event: Event | null = null;
  try {
    const indexPath = path.join(process.cwd(), 'public/fixtures/events.json');
    const raw = await fs.readFile(indexPath, 'utf8');
    const data = JSON.parse(raw) as EventsIndex;
    event = data.events.find((e) => e.slug === params.slug) ?? null;
  } catch {
    event = null;
  }
  return <EventDetailClient slug={params.slug} event={event} />;
}
