# Security model

| Capability                                 | Owner | Administrator | SRE | Investigator | Viewer |
| ------------------------------------------ | ----- | ------------- | --- | ------------ | ------ |
| Read scoped evidence / reports / SSE       | yes   | yes           | yes | yes          | yes    |
| Create/update incidents / notes / analysis | yes   | yes           | yes | yes          | no     |
| Start/stop local experiments               | yes   | yes           | yes | no           | no     |
| Administrative permission guard            | yes   | yes           | no  | no           | no     |

Roles and memberships are enforced on the server. The first seed creates one owner and one environment; self-service invitations, role editing and organization provisioning are not implemented. The administrative guard is prepared but no cosmetic management controls pretend those workflows exist.

Passwords use Argon2id. Cookies hold cryptographically random opaque values; only their SHA-256 digests are persisted. Sessions expire after eight hours. Cookies are HttpOnly, SameSite Strict, and Secure in production. Mutation requests require a session-specific CSRF header; an Origin header, when present, must match the configured web origin. Login is rate-limited separately. Logout deletes the session; SSE checks continued session validity while connected.

Every evidence read includes workspace/environment predicates. Record detail routes check environment ownership. Fault labels live separately from normal telemetry and never enter ranking inputs. Expensive windows, result counts, ingestion attributes and workload concurrency have bounds. Queries use SQLite placeholders, Prisma operations or ClickHouse typed parameters. The frontend renders telemetry as text, never trusted HTML. There is no raw SQL/code execution endpoint.

The lab uses fixed service enums and fixed loopback/Docker service hostnames. Arbitrary URLs, external load targets and unbounded resource requests cannot pass validation. Pool/queue capacities and expiry are enforced inside the synthetic process. Resource saturation waits on a bounded resource rather than exhausting the host.

Production configuration rejects the local storage adapter, placeholder credentials, a default seed password, and a non-HTTPS origin. **Supplied Compose settings are local development settings**, bound to loopback, not a hardened public deployment. The local receiver/demo listeners should be firewalled on shared networks. Internal log redaction is key-based; production telemetry requires a reviewed allowlist/redaction policy.

Unfinished production controls: distributed rate limits, durable controller leases, TLS/mTLS provisioning, dynamic ingestion credential rotation, enterprise SSO, account recovery, normalized email indexes, comprehensive immutable audit trails, dependency vulnerability review, backup restores and a penetration test. This edition is not a compliance certification.
