import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dalil" };

/** Bare frame for the desktop windows: no site chrome, transparent so the notch floats on the screen. */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-shell className="h-screen w-screen overflow-hidden bg-transparent">
      {children}
    </div>
  );
}
