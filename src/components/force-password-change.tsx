import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown instead of the app until a member replaces the seeded default password. */
export function ForcePasswordChange() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>You are using a temporary password. Pick a new one to continue.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
