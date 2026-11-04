# Your move

## What it is

The Your move island lists the rows whose turn is on you. The server decides which rows those are (see
[the rules table](rules-table.md)); `yourRows` in `web/src/lib/moves.ts` only picks and orders the rows the
window already has. RMA-258.

## Where it lives

| File | Role |
|---|---|
| `web/src/lib/moves.ts` | `yourRows`, the open and handled lists and their counts; the other row filters of the dashboard; `outcomeTone`, the pill tone of a report outcome (`open`, `ready`, `done`, `dropped`) |
| `web/src/features/your-move/YourMove.vue` | Renders the list and sends the Handled mark |

## How it behaves

- A row is in the list when its group is `you`, or when it is handled and its automatic mark is alive: a
  row whose turn passed on stays under Handled while that mark lives.
- A row is handled when its group is not `you`, or when the server set the handled flag on it.
- Rows are ordered by the server's rank, lowest first, then oldest first.
- The open view lists only open rows and the handled view only handled ones. Handled on an open row
  opens the note window first and writes nothing; Save sends the handled flag and the note in one marks
  write, Skip sends the flag alone, and closing the window sends nothing, so the row never changes view
  while the note is typed.
- The counts are of the whole list, not of the view: `open` and `handled`.

## What obliges an update

Any change to `yourRows` that changes which rows are listed, their order, or the counts.
