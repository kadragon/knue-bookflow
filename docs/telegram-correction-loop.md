# Telegram Correction Loop

The correction loop is a two-phase flow: the daily **broadcast** plants a message in the Telegram chat, and a user **reply** corrects a typo in the note that was broadcast. The two phases are linked by a D1 mapping table that ties the Telegram `message_id` to the internal `note_id`.

## Flow diagram

```
Cron (0 3 * * *)
  └─ broadcastDailyNote()                       note-broadcast.ts
       ├─ selectNoteCandidate()                 lowest send_count, random tiebreak
       ├─ sendTelegramMessage()                 → Telegram API sendMessage
       │    └─ returns message_id
       ├─ TelegramMessageRepository.save()      INSERT telegram_message_notes
       └─ repository.incrementSendCount()       +1 note_send_stats (only if mapping saved)

User replies to the broadcast message in Telegram
  └─ POST /webhook/telegram                     index.ts:197
       └─ handleTelegramWebhook()               telegram-webhook-handler.ts
            ├─ auth: X-Telegram-Bot-Api-Secret-Token
            ├─ guard: must be reply, correct chat, has text
            ├─ findNoteIdByMessageId(reply_to.message_id)
            │    └─ SELECT telegram_message_notes
            ├─ parse correction: "<typo> > <replacement>"
            ├─ findNoteById() + content.includes(typo) check
            ├─ NoteRepository.update()          content.replace(typo, replacement)
            └─ setReaction(👍 | 👎)             best-effort, errors swallowed
```

## Correction command format

Reply to a broadcast message with:

```
original text > replacement text
```

The handler splits on the first `>`. Both sides are trimmed. If either is empty, or the original text is not found verbatim in the note content, the reply gets a 👎 reaction and the note is unchanged.

`String.replace` replaces only the **first** occurrence.

## D1 tables involved

| Table | Purpose |
|-------|---------|
| `telegram_message_notes` | `telegram_message_id PK → note_id FK`. Created by migration `0008`. Cascade-deletes when the note is deleted. |
| `note_send_stats` | `note_id → send_count, last_sent_at`. Drives the round-robin selection so all notes are broadcast roughly equally. |

## Atomicity invariant

In `broadcastDailyNote`, the send count increment only runs if the `telegram_message_notes` insert succeeded. If the mapping write fails, `send_count` is **not** incremented. This keeps the two writes consistent: no mapping means future replies silently drop the correction (👎), but the note is never double-counted as sent.

## Auth

Requests to `POST /webhook/telegram` are validated against the `X-Telegram-Bot-Api-Secret-Token` header:

- Secret set → header must match; 401 otherwise.
- Secret unset + `ENVIRONMENT=production` → always 403.
- Secret unset + non-production → warning, request allowed (local dev).

## Reaction semantics

`setReaction` is best-effort: errors are logged but do not affect the HTTP response. The handler always returns `200 OK` to Telegram — this prevents Telegram from retrying the webhook indefinitely.

| Emoji | Meaning |
|-------|---------|
| 👍 | Note content updated successfully. |
| 👎 | Any failure: no mapping found, `findNoteById` unavailable, typo not in content, `updateNote` returned null. |

## Key files

| File | Role |
|------|------|
| `packages/backend/src/services/note-broadcast.ts` | Broadcast side: selects + sends note, saves mapping, increments send count. |
| `packages/backend/src/handlers/telegram-webhook-handler.ts` | Correction side: parses reply, looks up note, applies patch, reacts. |
| `packages/backend/src/services/telegram-message-repository.ts` | `TelegramMessageRepository`: `save` and `findNoteIdByMessageId`. |
| `packages/backend/src/services/note-repository.ts` | `NoteRepository.findById` / `.update`. |
| `packages/backend/migrations/0008_add_telegram_message_notes.sql` | Schema for the mapping table. |
| `packages/backend/src/index.ts:197` | Route registration: `POST /webhook/telegram`. |
