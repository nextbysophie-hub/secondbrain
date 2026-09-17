import { Suspense } from "react";
import BoardApp from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; todos?: string; ideas?: string }>;
}) {
  const { key, todos, ideas } = await searchParams;
  return (
    <Suspense>
      <BoardApp
        initialKey={key?.trim() ?? ""}
        initialTodoDb={todos?.trim() ?? ""}
        initialIdeaDb={ideas?.trim() ?? ""}
      />
    </Suspense>
  );
}
