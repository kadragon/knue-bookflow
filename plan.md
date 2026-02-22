# Plan

- [x] scheduled cron triggers a scheduled sync start log (verifies sync path runs)
- [x] scheduled sync failure sends a Telegram alert with the error message
- [x] scheduled sync completion logs a single summary line with key counts
- [x] cron renewal candidate requires renewCnt exactly 0 and due within 2 days

## Request Book - Planned Loan Auto Sync

> Automatically add ON_SHELF request books to planned loans while respecting user dismissals.

- [x] LibraryClient가 acq-requests를 인증 포함 페이징 조회한다
- [x] sync가 ON_SHELF 희망도서를 request_book source로 planned_loans에 추가한다
- [x] sync는 기존 planned/dismissed biblio를 재추가하지 않는다
- [x] charges가 0이어도 희망도서 자동추가는 수행된다
- [x] acq-requests 실패 시 sync 전체는 실패하지 않는다
- [x] request_book 삭제 시 dismissal이 저장된다
- [x] request_book 이외 source 삭제는 dismissal을 만들지 않는다
