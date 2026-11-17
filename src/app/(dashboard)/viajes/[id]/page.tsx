import { requireUser } from "@/features/auth/session";
import { TripDetail } from "@/features/trips/trip-views";
import { getTripContent } from "@/features/trips/data";
import { notFound } from "next/navigation";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const content = await getTripContent(id);
  if (!content) notFound();
  return <TripDetail id={id} content={content} />;
}
