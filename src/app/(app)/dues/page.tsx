import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { MyDues } from "./_components/my-dues";
import { TreasurerDashboard } from "./_components/treasurer-dashboard";

export const metadata = { title: "Dues" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DuesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  if (!can(user, "dues.manage")) {
    return (
      <>
        <PageHeader title="Dues" description="Your balance, what you have been charged, and what you have paid." />
        <MyDues memberId={user.id} />
      </>
    );
  }
  return (
    <>
      <TreasurerDashboard
        periodParam={one("period")}
        status={one("status")}
        classFilter={one("class")}
        q={one("q")}
        billed={one("billed")}
        total={one("total")}
        lateFees={one("latefees")}
      />
      <section className="mt-10" aria-labelledby="my-dues-heading">
        <h2 id="my-dues-heading" className="mb-3 text-lg font-semibold">
          My dues
        </h2>
        <MyDues memberId={user.id} />
      </section>
    </>
  );
}
