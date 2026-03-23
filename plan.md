# Plan


## Request Book - Planned Loan Auto Sync

> Automatically add ON_SHELF request books to planned loans while respecting user dismissals.

## Telegram Webhook Secret Enforcement

> Reject unauthenticated Telegram webhook traffic in production while keeping non-production setup usable.

- [x] production에서 `TELEGRAM_WEBHOOK_SECRET`가 비어 있으면 webhook 요청을 거부한다
- [x] production에서 `TELEGRAM_WEBHOOK_SECRET`가 비어 있으면 설정 누락을 로깅한다
- [x] non-production에서 `TELEGRAM_WEBHOOK_SECRET`가 비어 있으면 인증을 건너뛰고 기존 처리 흐름을 유지한다
