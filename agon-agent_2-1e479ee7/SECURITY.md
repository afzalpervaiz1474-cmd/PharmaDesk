# Security policy

PharmaDesk handles a store's commercial data, so security reports are taken seriously.

## Supported versions

The project is pre-release. Only the latest commit on `main` receives security fixes.

| Version | Supported |
| --- | --- |
| `main` (0.1.x) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting).

> Maintainers: enable this under *Settings → Code security → Private vulnerability reporting*. If you prefer
> email, add a dedicated security address here.

Please include:

- the affected component (desktop app, backend, sync, assistant) and version or commit;
- what an attacker could achieve;
- steps to reproduce, or a proof of concept;
- any suggested fix.

Do not include real customer, patient or store data, and do not test against systems you do not own.

### What to expect

This is a volunteer project with no guaranteed response time. The maintainers aim to acknowledge a report within
a week, agree a fix and disclosure date with you, and credit you in the release notes unless you prefer otherwise.

## Security design

| Area | Current state |
| --- | --- |
| API keys | The OmniRoute key is read from the backend environment only. It is not shipped in the desktop app, not returned by any endpoint, and excluded from error messages and logs |
| Passwords | scrypt with a random salt per password. Plain passwords are never stored or logged |
| Sessions | HS256 JWT access tokens with an expiry. The server refuses to start with a signing secret shorter than 32 characters, and with the example placeholder in production |
| Tenant isolation | Every business query filters by the pharmacy id from the verified token; cross-tenant writes are rejected (covered by end-to-end tests) |
| Input validation | DTO validation on all requests; unknown properties are rejected; SQL is always parameterised |
| Error responses | Unexpected errors return a generic message; details stay in the server log |
| Assistant | Read-only, fixed data functions. The model cannot run SQL or choose which store's data it reads |
| Desktop permissions | The window is granted only core and SQL plugin permissions; scripts are limited to the app by CSP |

## Known gaps

These are documented so nobody assumes protection that does not exist yet:

- **No rate limiting** on login or registration.
- **No refresh tokens, password reset or email verification.**
- The desktop app stores its access token in `localStorage`, not in the operating system keychain.
- The local **SQLite database is not encrypted**. Anyone with access to the computer's user account can read it.
- The desktop CSP allows connections to any `https:` host, because the backend address is user-configurable.
- Sync conflict resolution trusts device clocks.
- No security audit or penetration test has been carried out.
- The hosted browser preview is an open demo: anyone can read and change its sample data. Never put real data
  in it.

## Guidance for operators

- Generate `JWT_SECRET` with `openssl rand -hex 32` and keep it out of version control.
- Serve the backend over HTTPS only, and set `CORS_ORIGINS` to the origins you actually use.
- Set `AUTH_ALLOW_REGISTRATION=false` once your accounts exist.
- Use a dedicated PostgreSQL role with access to the PharmaDesk database only, and back the database up.
- Rotate the OmniRoute key if it may have been exposed.
- Use full-disk encryption on computers that run the desktop app.
