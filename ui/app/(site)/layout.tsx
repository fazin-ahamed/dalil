import { SiteNav } from "@/components/dalil/site-nav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background-full">
      <SiteNav />
      {children}
    </div>
  );
}
