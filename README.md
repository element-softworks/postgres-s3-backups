# Postgres S3 backups

A simple NodeJS application to backup your PostgreSQL database to S3 via a cron.

## Configuration

- `AWS_ACCESS_KEY_ID`: AWS access key ID.
- `AWS_SECRET_ACCESS_KEY`: AWS secret access key.
- `AWS_S3_BUCKET`: Name of the S3 bucket to store backups.
- `AWS_S3_REGION`: AWS region for the S3 bucket. Default: `eu-west-2`.
- `BACKUP_DATABASE_URL`: Connection string for the database to back up.
- `BACKUP_CRON_SCHEDULE`: Cron schedule for backups. Default: `0 5 * * *`.
- `AWS_S3_ENDPOINT`: Custom S3 endpoint (e.g., for MinIO, Cloudflare R2, Backblaze B2). Default: empty.
- `AWS_S3_FORCE_PATH_STYLE`: Use path-style URLs for S3 (needed for some endpoints like MinIO). Default: `false`.
- `RUN_ON_STARTUP`: Run a backup immediately on startup. Default: `false`.
- `SINGLE_SHOT_MODE`: Run a single backup on start and exit. Default: `true`.
- `SUPPORT_OBJECT_LOCK`: Enable S3 Object Lock support (adds MD5 hash). Default: `true`.
- `BACKUP_OPTIONS`: Extra `pg_dump` options. Default: empty.
- `BACKUP_PROJECT_NAME`: Product name for backup pathing (e.g., `my-project`). **Required**.
- `BACKUP_ENV`: Environment name for backup pathing (e.g., `staging`, `uat`, `prod`). **Required**.
- `BACKUP_FREQUENCY`: Frequency for backup pathing (e.g., `daily`, `weekly`, `monthly`). **Required**.

See [pg_dump docs](https://www.postgresql.org/docs/current/app-pgdump.html) for valid options for `BACKUP_OPTIONS`.
