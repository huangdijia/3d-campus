import { notFound } from 'next/navigation';
import Atlas from '../../ui/atlas';
import universities from '../../data/universities.json';
export default async function UniversityPage({
  params,
}: {
  params: Promise<{ universityId: string }>;
}) {
  const { universityId } = await params;
  if (!universities.some((u) => u.id === universityId)) notFound();
  return <Atlas initialId={universityId} />;
}
