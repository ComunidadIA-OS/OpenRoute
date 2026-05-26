import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/shared/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          username: session.username,
          fullName: session.fullName,
          role: session.role,
        }}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
