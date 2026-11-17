/** Re-mounts on every navigation inside the console, so each page eases in like the app does. */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cr-page-in flex min-w-0 flex-col gap-6">{children}</div>;
}
