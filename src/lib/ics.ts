// Builds an .ics calendar file (Google Calendar, Outlook, Apple Calendar) of contract dates, with reminders.

export interface IcsEvent {
  uid: string;
  date: string; // YYYY-MM-DD, all-day
  title: string;
  description: string;
  url?: string;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Folds lines at 75 octets as RFC 5545 asks (approximated by characters). */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

export function buildIcs(events: IcsEvent[], opts: { name: string; reminderDays: number[] }): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Contract Radar//Renewal calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description + (e.url ? `\n${e.url}` : ""))}`,
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
    );
    for (const d of [...opts.reminderDays, 1]) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-P${d}D`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
