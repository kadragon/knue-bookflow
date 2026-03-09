# Plan


## Request Book - Planned Loan Auto Sync

> Automatically add ON_SHELF request books to planned loans while respecting user dismissals.


## Telegram Note Correction - Typo Patch

> Reply 댓글을 오탈자 치환 명령으로 안전하게 부분 수정한다.

- [x] 댓글 수정 성공 시 사용자 댓글에 ✅ 리액션을 남긴다
- [x] `>` 구분자가 없으면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [x] 오탈자 부분이 비어 있으면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [x] 수정 부분이 비어 있으면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [x] 오탈자를 찾지 못하면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [x] findNoteById가 null을 반환하면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [x] reply 매핑이 없으면 사용자 댓글에 ❌ 리액션을 남긴다
- [x] 리액션 전송 실패는 로깅만 하고 webhook 응답은 200을 유지한다
