import Poster from "./Poster";

export const metadata = { title: "Cartel para imprimir" };

export default async function PosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Poster id={id} />;
}
