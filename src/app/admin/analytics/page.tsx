import { getSession, canAccessAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import AnalyticsDashboard from "./analytics-dashboard";

export default async function AdminAnalyticsPage() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) redirect("/dashboard");

  return (
    <div>
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Analytics" }]} />
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <AnalyticsDashboard />
    </div>
  );
}
