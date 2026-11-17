/** Re-mounts on every navigation inside the app, so each page eases in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cr-page-in flex min-w-0 flex-col gap-6">{children}</div>;
}
