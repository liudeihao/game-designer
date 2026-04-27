import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-ui-mono text-sm text-text-muted">加载…</div>}>
      <LoginForm />
    </Suspense>
  );
}
