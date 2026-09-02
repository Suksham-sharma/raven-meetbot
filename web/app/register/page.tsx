import { AuthScreen } from "@/components/auth/auth-screen";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string | string[] }>;
}) {
  const params = await searchParams;
  const google = Array.isArray(params.google) ? params.google[0] : params.google;
  return <AuthScreen mode="register" googleResult={google} />;
}
