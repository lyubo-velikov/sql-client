# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **lyubo.velikoff@gmail.com**

Include:
- A description of the vulnerability
- Steps to reproduce
- Any relevant screenshots or logs

I will acknowledge receipt within 72 hours and aim to provide a fix or response within 7 days.

## Supported Versions

Only the latest version on the `master` branch is actively maintained.

## Security Model

This is a desktop application that connects directly to PostgreSQL databases using credentials you provide. Key security properties:

- **Database passwords** are encrypted at rest using Electron's [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) API (OS-level keychain)
- **API keys** (for the AI assistant) are also encrypted via safeStorage
- **No telemetry** or analytics — the app does not phone home
- **No remote code execution** — the app loads only local bundled code
- **Context isolation** is enabled — the renderer process cannot access Node.js APIs directly

## Scope

The following are considered in scope:
- Remote code execution
- Path traversal / arbitrary file access
- Credential exposure
- XSS leading to code execution or data theft
- Authentication or authorization bypasses

The following are out of scope:
- Denial of service attacks
- Issues requiring physical access to the machine
- Social engineering
- Vulnerabilities in third-party dependencies (please report those upstream)
