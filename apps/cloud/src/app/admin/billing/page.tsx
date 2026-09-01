import { BillingForm } from "./billing-form";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { CopyField } from "@/components/ui/copy-button";
import { getAdminSetting } from "@/lib/admin-api";
import { isEncryptionConfigured } from "@/lib/crypto/envelope";
import { getBillingProvider } from "@/lib/billing";
import { webhookUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing — Admin" };

type PlainMeta = {
  provider?: "polar" | "paddle";
  polarConfigured?: boolean;
  paddleConfigured?: boolean;
} | null;

export default async function AdminBillingPage() {
  const setting = await getAdminSetting("billing");
  const plain = (setting?.value_plain ?? null) as PlainMeta;
  const provider = await getBillingProvider();
  const encryptionConfigured = isEncryptionConfigured();

  const statusMeta = plain
    ? {
        provider: plain.provider ?? "polar",
        polarConfigured: Boolean(plain.polarConfigured),
        paddleConfigured: Boolean(plain.paddleConfigured),
      }
    : null;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Connect the payment account. Credentials are encrypted at rest."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Connection status"
            action={
              <Badge tone={provider.isConfigured() ? "success" : "warning"}>
                {provider.isConfigured() ? "connected" : "not connected"}
              </Badge>
            }
          />
          <CardBody className="space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
              Active provider:{" "}
              <span className="font-medium text-[var(--color-fg)]">
                {provider.name}
              </span>
              {provider.isConfigured()
                ? " — ready to create checkouts and receive webhooks."
                : " — add credentials below to go live."}
            </p>
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-muted)]">
                Webhook URL (paste into your provider dashboard)
              </p>
              <CopyField value={webhookUrl()} label="Copy URL" />
              <p className="mt-2 text-xs text-[var(--color-faint)]">
                The endpoint verifies the signature on the raw body before processing
                and is idempotent, so provider retries are safe.
              </p>
            </div>
          </CardBody>
        </Card>

        {!encryptionConfigured ? (
          <Banner tone="danger" title="Encryption key required">
            Set <code className="font-mono">ADMIN_SECRET_KEY</code> before saving any
            credentials — the form will refuse to store secrets in plaintext.
          </Banner>
        ) : null}

        <Card>
          <CardHeader
            title="Credentials"
            description="Secrets are encrypted with AES-256-GCM and never sent back to the browser."
          />
          <CardBody>
            <BillingForm
              status={statusMeta}
              encryptionConfigured={encryptionConfigured}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
