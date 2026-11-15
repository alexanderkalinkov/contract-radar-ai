import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-1 flex-col gap-6 px-4 pt-7 pb-12 sm:px-8">
        {children}
      </main>
    </div>
  );
}
