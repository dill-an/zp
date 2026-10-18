import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata = { title: "Change password" };

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" />
      <Card>
        <CardContent className="py-4">
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
