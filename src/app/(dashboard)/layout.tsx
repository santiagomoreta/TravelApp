import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/features/auth/session";
import { getProfileName } from "@/features/auth/profile";
import { getTrips } from "@/features/trips/data";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const [name, trips] = await Promise.all([getProfileName(user), getTrips()]);
  return (
    <AppShell
      key={user.id}
      trips={trips}
      today={new Date().toISOString().slice(0, 10)}
      account={{ name, email: user.email || "" }}
    >
      {children}
    </AppShell>
  );
}
