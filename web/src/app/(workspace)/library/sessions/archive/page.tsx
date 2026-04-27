import Link from "next/link";

export default function ArchivePage() {
  return (
    <div className="px-6 py-10">
      <h1 className="font-display text-2xl">归档</h1>
      <p className="text-ui-mono mt-2 text-sm text-text-muted">v0：归档清单可由后端提供。</p>
      <Link href="/library/sessions" className="text-ui-mono mt-6 inline-block text-accent">
        返回会话
      </Link>
    </div>
  );
}
