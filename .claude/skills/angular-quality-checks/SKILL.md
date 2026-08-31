---
name: angular-quality-checks
description: Reference for writing Angular/TypeScript/HTML code that passes this repo's SonarCloud analysis and angular-eslint lint checks. Use before finishing any change to .ts or .html files in src/app, or whenever asked to fix SonarCloud/lint findings.
---

# Angular quality checks (SonarCloud + angular-eslint)

This repo's CI runs `ng lint` (angular-eslint + typescript-eslint) and SonarCloud
Code Analysis on every PR. Both fail the pipeline on any finding. Follow these
rules while writing code, and run the verification commands below before
considering a change done.

## TypeScript rules

- **Use `Number.parseInt` / `Number.parseFloat`, never the bare global
  `parseInt`/`parseFloat`.** Sonar rule: prefer the namespaced form.
  ```ts
  // bad
  const id = parseInt(value, 10);
  // good
  const id = Number.parseInt(value, 10);
  ```
- **Use `T[]`, never `Array<T>`.** typescript-eslint `array-type` rule.
  ```ts
  // bad
  readonly items: Array<'E' | 'M' | 'O'> = ['E', 'M', 'O'];
  // good
  readonly items: ('E' | 'M' | 'O')[] = ['E', 'M', 'O'];
  ```
- **Mark class fields `readonly` whenever they're only assigned once (in the
  field initializer or constructor).** This applies to `inject()` results and
  computed constants.
  ```ts
  export class UsuariosService {
    private readonly http = inject(HttpClient);
    private readonly API = `${environment.apiUrl}/usuarios`;
  }
  ```
- **Avoid regexes with two or more adjacent unbounded quantifiers over
  overlapping character classes** (e.g. `[^\s@]+@[^\s@]+\.[^\s@]+`). Sonar
  flags these as super-linear/ReDoS-prone because the engine can backtrack
  across ambiguous split points. Prefer plain string operations
  (`indexOf`, `includes`, `slice`) or a regex with disjoint character classes
  around each anchor instead of one big pattern.
  ```ts
  // bad — flagged as super-linear
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  // good — no backtracking ambiguity
  private isValidEmail(email: string): boolean {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex === email.length - 1) return false;
    if (email.indexOf('@', atIndex + 1) !== -1) return false;
    if (/\s/.test(email)) return false;
    return email.includes('.', atIndex + 1);
  }
  ```
- Prefer `HttpErrorResponse` typing on `error` callbacks and read the API's
  actual error shape (check a real error response body before guessing the
  field name — this API returns `{ "error": "message" }`, not `.message`).

## Template (HTML) rules

- **Every `<label>` must be associated with a control**, via matching
  `for`/`id`:
  ```html
  <label class="field-label" for="user-email">Correo</label>
  <input id="user-email" [(ngModel)]="form.email" />
  ```
  If there's no visible label (e.g. a search box with only a placeholder),
  add a visually-hidden `<label>` instead of skipping it:
  ```html
  <label class="sr-only" for="user-search">Buscar usuarios</label>
  <input id="user-search" [(ngModel)]="search" />
  ```
  ```css
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  ```
- **Any non-interactive element (`div`, `span`) with `(click)` needs a
  keyboard equivalent and must be focusable.** angular-eslint rules:
  `click-events-have-key-events` and `interactive-supports-focus`. Add
  `role`, `tabindex="0"`, and a `(keydown.enter)`/`(keydown.escape)` handler:
  ```html
  <div class="overlay" role="button" tabindex="0" aria-label="Cerrar panel"
    (click)="closeDrawer()"
    (keydown.enter)="closeDrawer()"
    (keydown.escape)="closeDrawer()"></div>
  ```
  Prefer a real `<button>` when the element has no other layout constraints —
  it's focusable and keyboard-accessible for free.
- **Don't use `(click)="$event.stopPropagation()"` on a modal/dialog wrapper
  just to prevent an overlay's close-on-click from firing.** That still
  needs its own key handler and adds a meaningless interactive role to a
  content container. Instead, check the click target on the overlay itself:
  ```html
  <div class="modal-overlay" role="button" tabindex="0" aria-label="Cerrar diálogo"
    (click)="$event.target === $event.currentTarget && closeConfirm()"
    (keydown.enter)="closeConfirm()"
    (keydown.escape)="closeConfirm()">
    <div class="modal" role="dialog" aria-modal="true">
      <!-- content; no click handler needed here -->
    </div>
  </div>
  ```
- Drag/drop zones and other clickable containers need the same treatment
  (`role="button"`, `tabindex="0"`, `(keydown.enter)`, `(keydown.space)` with
  `$event.preventDefault()` to stop page scroll).

## Verifying before you're done

`ng build` / `ng lint` may refuse to run if the local Node version is below
what `@angular/cli` requires — that's a CLI gate, not a real blocker. Run the
underlying tools directly instead of giving up on verification:

```bash
# Type-check (bypasses the ng CLI Node-version gate)
npx tsc --noEmit -p tsconfig.app.json

# Lint (bypasses the ng CLI Node-version gate too)
npx eslint <changed files...>
```

Both must produce no output/errors before calling a change complete. If SonarCloud
comments on a PR with specific line/rule findings, treat each one as a required
fix, not a suggestion — this repo's CI treats lint errors as build failures.

## Zoneless change detection (this repo has no zone.js)

This project runs Angular with no `zone.js` installed, so it's fully
zoneless. Plain class-property mutations made inside `HttpClient.subscribe()`
callbacks or `setTimeout()` do **not** trigger a re-render on their own —
only template-bound events (click, input, etc.) do. If a component mutates
its own state from an async callback (HTTP response, timer), inject
`ChangeDetectorRef` and call `markForCheck()` at the end of that callback:

```ts
private readonly cdr = inject(ChangeDetectorRef);

this.http.get(url).subscribe({
  next: (data) => {
    this.items = data;
    this.cdr.markForCheck(); // required — nothing else will repaint this
  },
});
```

Symptom if this is missed: a spinner or state change that "gets stuck" and
only updates after an unrelated click happens elsewhere on the page.
