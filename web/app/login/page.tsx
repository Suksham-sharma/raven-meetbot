import { AuthScreen } from "@/components/auth/auth-screen";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string | string[] }>;
}) {
  const params = await searchParams;
  const google = Array.isArray(params.google) ? params.google[0] : params.google;
  return <AuthScreen mode="login" googleResult={google} />;
}
