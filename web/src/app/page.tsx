import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <h1 className="font-display text-5xl text-text-primary md:text-6xl">GAME DESIGNER</h1>
      <p className="text-ui-mono max-w-md text-center text-sm text-text-muted">
        以素材概念为核心，文本定义逻辑，设计与实现解耦。
      </p>
      <div className="flex gap-4">
        <Link
          href="/explore"
          className="rounded border border-accent bg-accent/10 px-6 py-2 text-ui-mono text-sm text-accent hover:bg-accent/20"
        >
          探索公开库
        </Link>
        <Link
          href="/library/assets"
          className="rounded border border-border px-6 py-2 text-ui-mono text-sm text-text-primary hover:border-accent/40"
        >
          我的库
        </Link>
      </div>
    </div>
  );
}
