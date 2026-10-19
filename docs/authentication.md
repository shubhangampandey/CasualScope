# Signing in and registering

Open `/app` and choose **New here? Create an account**. Registration requires a name, valid email and a password of 14–200 characters, then signs you in with the existing HttpOnly session and CSRF protections. Email matching is trimmed and case-insensitive; passwords are not trimmed and are hashed with Argon2id. Existing users are looked up directly, not through a list capped at 500 accounts. Duplicate registrations are rejected atomically without overwriting credentials. Email ownership verification and password-reset email are not implemented.

Each new account owns a separate, initially empty workspace. It does not receive access to the shared Northstar data or globally controlled Northstar fault lab. This preserves tenant isolation rather than granting public users ownership of the demo. The seeded Northstar account remains the way to use the shared synthetic fault-lab environment.

The seeded local account defaults to `engineer@northstar.local`, or `DEMO_EMAIL` if configured. Its initial password comes from the local `.env` `DEMO_PASSWORD`. Production uses its own provisioned password; never assume that the local default works on a deployment. Changing an environment variable does not reset an existing account's password, and no hard-coded password is prefilled in the UI.

`GET /api/v1/auth/session` returns 200/null when signed out or expired. Private APIs and incorrect credentials still return 401. Backend connection failures now appear as errors instead of being mistaken for a signed-out state. Development accepts localhost/127.0.0.1/IPv6 loopback aliases on the configured protocol and port; production continues to enforce the exact `WEB_ORIGIN` and secure HTTPS cookies. Frontends must proxy `/api` to the backend.

Run `pnpm exec vitest run tests/security/registration.test.ts`. Tests use a temporary SQLite database, not your application data.
