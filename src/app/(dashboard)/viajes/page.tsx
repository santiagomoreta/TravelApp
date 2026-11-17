import { requireUser } from "@/features/auth/session";
import { TripsView } from "@/features/trips/trip-views";

export default async function TripsPage() {
  await requireUser();
  return <TripsView all />;
}
