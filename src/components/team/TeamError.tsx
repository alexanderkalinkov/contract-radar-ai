import { Card, H2 } from "@/components/ui";

export function TeamError({ message }: { message: string }) {
  return (
    <Card label="Error" className="flex flex-col gap-2 border-[#FDA29B] p-5">
      <H2>Couldn&apos;t load your team</H2>
      <p className="m-0 text-sm text-ink-2">{message}</p>
    </Card>
  );
}

export function SampleTeamNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] text-muted">
      You&apos;re looking at a sample team (the fictional Northwind Logistics) so you can see how this works. It disappears as soon as you
      add your first tool or upload a contract.
    </div>
  );
}
