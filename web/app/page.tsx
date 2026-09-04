import { cookies } from "next/headers";
import { HomePage } from "@/components/home/home-page";
import { Landing } from "@/components/landing/landing";

export default async function RootPage() {
  const jar = await cookies();
  return jar.has("token") ? <HomePage /> : <Landing />;
}
