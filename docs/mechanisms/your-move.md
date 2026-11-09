# Your move

## What it is

The Your move island lists the rows whose turn is on you. The server decides which rows those are (see
[the rules table](rules-table.md)); `yourRows` in `web/src/lib/moves.ts` only picks and orders the rows the
window already has. RMA-258.

## Where it lives

| File | Role |
|---|---|
| `web/src/lib/moves.ts` | `yourRows`, the open and handled lists and their counts; the other row filters of the dashboard; `outcomeTone`, the pill tone of a report outcome (`open`, `ready`, `done`, `dropped`) |
| `web/src/features/your-move/YourMove.vue` | Renders the list and sends the handled mark |

## How it behaves

- A row is in the list when its group is `you`, or when it is handled and its automatic mark is alive: a
  row whose turn passed on stays under Handled while that mark lives.
- A row is handled when its group is not `you`, or when the server set the handled flag on it.
- Rows are ordered by the server's rank, lowest first, then oldest first.
- The open view lists only open rows and the handled view only handled ones. Mark handled on an open row
  writes the handled flag at once, with no window, and offers Undo for a moment; marking several rows in a
  row is one click each.
- A handled row the user marked carries a `handled` chip and an Undo. A handled row the monitor marked
  itself (a ticket passed on, `auto: true` in the mark's info) carries an `auto` chip with a hint saying why
  and an Undo that removes the mark; its Next step text is not struck through.
- A review request lives while you are a requested reviewer of an open PR, read or not (RMA-358).
- The counts are of the whole list, not of the view: `open` and `handled`.

## The note window

`NoteModal.vue` shows the full outcome of a pass-on and the note of a handled row. It opens from Add note on a
handled row, or from the row's note or outcome line, and only ever writes the note.

- Save note sends the note alone; Cancel closes without writing. Neither changes the row's mark.
- Escape and the Close button act like Cancel. When text was typed, they first ask whether to discard it
  (`ui.noteAsk`, set by `closeTopLayer` while `ui.noteDirty`), and the note stays open until the user
  answers.

## Parked workspaces

`isDue` in `lib/backoff.mjs` decides whether a workspace is polled in a round: always when shown, never when paused, and every 15 minutes when parked. A parked workspace's first check after a start is due 15 minutes after its stored last check, and at once when there is none or it is older.

## What obliges an update

Any change to `yourRows` that changes which rows are listed, their order, or the counts; to `recentlyDone`, which
lists done tickets newest first and at most 15; or to `isDue` in `lib/backoff.mjs`, which decides when a parked
workspace is polled.
