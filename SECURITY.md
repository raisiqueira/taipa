# Security Policy

## Supported releases

Taipa UI is currently alpha software. Security fixes are applied to the latest published alpha and the `main` branch.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through [GitHub Security Advisories](https://github.com/raisiqueira/taipa/security/advisories/new). Do not open a public issue for a suspected vulnerability.

Include a minimal reproduction, affected package version, expected impact, and any mitigations already attempted. We will acknowledge reports within seven days and coordinate disclosure before publishing a fix.

## Security boundaries

Taipa escapes template interpolation, serializes island data inertly, validates registry inputs, and renders form errors as text. Applications remain responsible for authentication, authorization, CSRF, Content Security Policy, CORS, server-authored templates, and any use of `raw()`.
