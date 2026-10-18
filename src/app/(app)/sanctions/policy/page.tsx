import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { policyParagraphs, SANCTIONS_POLICY_KEY } from "@/lib/queries/sanctions-logic";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PolicyForm } from "../_components/policy-form";

export const metadata = { title: "Standards policy" };

export default async function PolicyPage() {
  const user = await requireUser();
  const manager = can(user, "sanctions.manage");
  const text = getSetting(SANCTIONS_POLICY_KEY);
  const paragraphs = policyParagraphs(text);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Standards policy"
        description="How sanctions, fines and work hours are decided in the house."
        actions={
          <Link href={manager ? "/sanctions" : "/sanctions?mine=1"} className={buttonClasses("ghost", "sm")}>
            {manager ? "Standards board" : "My sanctions"}
          </Link>
        }
      />

      <Card>
        <CardContent className="py-5">
          <article id="policy-text" className="space-y-3 text-sm leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i} className={text.trim() ? "" : "text-muted"}>
                {p}
              </p>
            ))}
          </article>
        </CardContent>
      </Card>

      {manager ? (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle>Edit policy</CardTitle>
              <CardDescription>Everyone in the house can read this page.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PolicyForm current={text} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
