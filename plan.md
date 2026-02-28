# Plan


## Request Book - Planned Loan Auto Sync

> Automatically add ON_SHELF request books to planned loans while respecting user dismissals.


## Telegram Note Correction - Typo Patch

> Reply 댓글을 오탈자 치환 명령으로 안전하게 부분 수정한다.

- [ ] 댓글 수정 성공 시 사용자 댓글에 ✅ 리액션을 남긴다
- [ ] `오탈 > 수정` 형식 오류면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [ ] 오탈자를 찾지 못하면 사용자 댓글에 ❌ 리액션을 남기고 수정하지 않는다
- [ ] reply 매핑이 없으면 사용자 댓글에 ❌ 리액션을 남긴다
- [ ] 리액션 전송 실패는 로깅만 하고 webhook 응답은 200을 유지한다
