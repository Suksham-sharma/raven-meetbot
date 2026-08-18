import { IntegrationsScreen } from "./integrations-screen";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string | string[] }>;
}) {
  const params = await searchParams;
  const result = Array.isArray(params.calendar)
    ? params.calendar[0]
    : params.calendar;

  return <IntegrationsScreen calendarResult={result} />;
}
