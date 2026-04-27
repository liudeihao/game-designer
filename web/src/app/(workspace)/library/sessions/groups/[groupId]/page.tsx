import { StagingGroupWorkspace } from "@/components/session/StagingGroupWorkspace";

type Props = { params: Promise<{ groupId: string }> };

export default async function StagingGroupPage(props: Props) {
  const { groupId } = await props.params;
  return <StagingGroupWorkspace groupId={groupId} />;
}
