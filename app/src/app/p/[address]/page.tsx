import ProducerProfile from "./ProducerProfile";

export const metadata = { title: "Productor" };

export default async function ProducerProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <ProducerProfile address={decodeURIComponent(address)} />;
}
