import { ActivityTimelineRow, type ActivityEvent } from './ActivityTimelineRow';

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">
        No activity yet.
      </div>
    );
  }
  return (
    <div className="vault-card py-2 relative">
      <div className="absolute left-[130px] top-[18px] bottom-[18px] w-px bg-divider pointer-events-none" />
      {events.map((event, i) => (
        <ActivityTimelineRow key={event.id ?? `${event.kind}-${i}`} event={event} />
      ))}
    </div>
  );
}
