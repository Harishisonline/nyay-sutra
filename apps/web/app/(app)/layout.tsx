import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main id="main" className="app-main">
        {children}
      </main>
    </>
  );
}
