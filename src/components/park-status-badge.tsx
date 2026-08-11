export function ParkStatusBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 ${className}`.trim()}
    >
      Defunct park
    </span>
  );
}
