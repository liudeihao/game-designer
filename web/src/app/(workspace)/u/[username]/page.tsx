type Props = { params: Promise<{ username: string }> };

export default async function UserPage(props: Props) {
  const { username } = await props.params;
  return (
    <div className="px-6 py-10">
      <h1 className="font-display text-3xl">@{username}</h1>
      <p className="text-ui-mono mt-2 text-sm text-text-muted">公开 profile · v0 静态占位</p>
    </div>
  );
}
