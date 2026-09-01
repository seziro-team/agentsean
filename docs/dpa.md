# Data processing addendum (hosted)

Sean processes crawl HTML, Search Console and Analytics rows, and Google
OAuth refresh tokens on behalf of the customer.

- **Roles.** Customer is the controller. Agent Sean (hosted) is the processor.
- **Instructions.** Process only to operate the subscribed plan.
- **Subprocessors.** Listed in [`subprocessors.md`](subprocessors.md). Advance notice before adding a processor that sees customer content.
- **Security.** Envelope encryption for secrets (`SEAN_KMS_KEY`). Loopback-only self-host remains available so customers can keep data on their own machines.
- **Erasure.** `DELETE` of a tenant removes sites (cascade), credentials, usage, and envelope keys. Google tokens are deleted with the credential store. Retention of Stripe invoices follows Stripe's own retention.
- **Transfers.** Google tokens stay in Google's US regions; compute is Hetzner (EU) by default.
- **Contact.** `privacy@agentsean.com` (placeholder until launch).
