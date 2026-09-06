import Link from 'next/link';
import Atlas from '../../../../ui/atlas';
export default async function CampusPage({
  params,
}: {
  params: Promise<{ universityId: string; campusId: string }>;
}) {
  const { universityId, campusId } = await params;
  if (campusId !== 'main')
    return (
      <main style={{ padding: 40 }}>
        此校区尚未收录。<Link href="/">返回全国地图</Link>
      </main>
    );
  return <Atlas initialId={universityId} />;
}
