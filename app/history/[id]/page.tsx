import Link from "next/link";
import JobView from "@/components/JobView";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <Link
        href="/history"
        className="inline-flex items-center gap-1.5 text-sm muted hover:text-[var(--accent)] transition-colors"
      >
        <span aria-hidden>←</span> Back to history
      </Link>
      <JobView jobId={id} />
    </div>
  );
}
