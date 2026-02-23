import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AnalyticsDashboard from "./analytics-dashboard";

export default async function AdminAnalyticsPage() {
  const session = await getSession();
  if (!session || session.is_admin !== 1) redirect("/dashboard");

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <a
          href="/admin"
          className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
        >
          &larr; Back to Admin
        </a>
      </div>
      <AnalyticsDashboard />
    </main>
  );
}
