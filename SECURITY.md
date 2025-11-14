# MediLoop Security & Compliance Notes

This sprint introduces the foundations for PHIPA/PIPEDA-aligned controls:

- **Role-based access control** – every user now has an explicit `role` (`admin`, `doctor`, `receptionist`). Backend middleware enforces roles on privileged routes (admin invites, audit logs, appointment updates). Receptionists get a dedicated queue/schedule workspace instead of EMR access.
- **Clinic ownership & invitations** – admins can invite staff, edit roles, and view an audit trail in the `/admin` console.
- **Audit logging** – every HTTP request is persisted in `audit_logs` with timestamp, user, IP, user-agent, method, path, and status. These logs are exposed via `/api/admin/audit` for compliance review.
- **Per-request telemetry** – middleware records IPs (or `x-forwarded-for`), method, route, and status for every response, surfacing suspicious activity immediately.
- **Data residency** – PostgreSQL/Supabase remains the single data store (Canada region). Ensure your Supabase project is created in a Canadian region; Vercel should be configured to route only to that database (documented in project README).
- **Encryption** – passwords hashed with Argon2, sessions delivered via HttpOnly SameSite=None cookies. TOTP secrets encrypted with AES-256-GCM using `AUTH_SECRET`.

Next steps for full PHIPA compliance:

- Enable database-at-rest encryption (Supabase default) and configure daily backups.
- Turn on HTTPS-only deployments (Vercel + custom Canadian domain) and document TLS policies for clients.
- Add breach alerting (e.g., log streaming to SIEM) and retention policies for `audit_logs`/patient data.
- Extend audit entries with geo-IP or clinic ID for multi-location analysis.
