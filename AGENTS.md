# AGENTS.md

Instructions for AI coding agents (Claude, Copilot, Jules, Cursor, etc.) and
humans working in this repository. Follow these rules on every task. If a
request conflicts with them, say so in the pull request description instead
of silently changing the architecture.

**Who works on this project:** a student team, most of whom are not
programmers. Code must be easy to read, heavily commented in plain English,
and easy to merge when several people are working at the same time.

---

## 1. Project overview

PulseCheck is a **clinic check-in and patient queue** demo.

- Plain HTML, CSS, and JavaScript. **No frameworks, no npm, no build step.**
- The app must work by **double-clicking `index.html`** (opened as a
  `file://` page). Do not add anything that requires a web server.
- There is no real database. Data is saved in the browser's `localStorage`
  (see `js/storage.js`).
- It is a **single-user demo**: one person switches between three views
  using the buttons in the top bar:

| View | Who it's for | What it does |
|---|---|---|
| **New Patient** (`new-patient`) | A patient | Check-in form. After checking in, the patient is "logged in" and taken to My Status. |
| **My Status** (`patient-status`) | A checked-in patient | Shows the patient's ticket, place in line, and estimated wait. A drop-down picks which patient you're "logged in" as. |
| **Staff View** (`admin`) | Clinic staff | Shows both queues. Staff call patients in, mark visits done, or remove patients. |

**Scope:** only patient-care features belong in this app. Do not add
unrelated demo content (greetings, guestbooks, marketing pages, etc.).

---

## 2. File layout: where things go

```
index.html                  The only page. Contains all three views.
css/
  base.css                  Shared look: colors, buttons, cards, form fields, top bar.
  new-patient.css           Styles for the New Patient view only.
  patient-status.css        Styles for the My Status view only.
  admin.css                 Styles for the Staff View only.
js/
  helpers.js                General tools (escapeHTML, time formatting). No patient logic.
  storage.js                The ONLY file that touches localStorage. Data model lives here.
  queue.js                  Queue rules: ordering and wait-time math. No page changes.
  views/
    new-patient.js          New Patient view logic.
    patient-status.js       My Status view logic.
    admin.js                Staff View logic.
  app.js                    Starts the app and switches views. Loaded last.
```

**Rule of thumb:** change the fewest files possible, and prefer the file that
belongs to the view you're working on. Working on the Staff View? You should
mostly be touching `js/views/admin.js`, `css/admin.css`, and the
`<section id="view-admin">` block in `index.html`.

### Script load order matters

The `<script>` tags at the bottom of `index.html` load in this order:
`helpers.js` → `storage.js` → `queue.js` → `views/*.js` → `app.js`.
Files can only use functions from files loaded before them (or at click-time,
after everything has loaded). Keep `app.js` last. Do **not** switch to
ES modules (`import`/`export`, `type="module"`); they don't work from `file://`.

---

## 3. Conventions

### Comments (required)

Readers are non-programmers, so explain *what* and *why* in plain English.

- Every file starts with a header block explaining what the file is for and
  where related HTML/CSS lives. Keep it up to date.
- Every function has a `/** ... */` comment describing what it does, its
  `@param`s, and what it `@returns`.
- Add a short comment above any line that isn't obvious to a beginner.
- Group related code under divider comments like
  `/* ---- SECTION NAME ---- */`.
- In HTML, each view `<section>` has a comment block saying which JS and CSS
  files go with it.

### JavaScript

- Plain functions and `const`/`let`. No classes, no libraries.
- Use full, descriptive names: `patientName`, not `pn`; `renderAdminView`,
  not `render3`.
- Use the constants in `js/storage.js` (`PATIENT_STATUS.WAITING`,
  `VISIT_TYPE.WALK_IN`, `STORAGE_KEYS.PATIENTS`) instead of typing raw
  strings like `'waiting'`.
- **Only `js/storage.js` may call `localStorage`.** Everywhere else, use its
  functions (`getAllPatients`, `addPatient`, `updatePatient`, `removePatient`,
  …). If you need a new kind of saved data, add a key to `STORAGE_KEYS` and
  getter/setter functions in `storage.js`.
- **Always wrap patient-entered text in `escapeHTML(...)`** when building
  HTML strings. For plain text, prefer `element.textContent = ...`.
- Show and hide things with the `hidden` attribute (`element.hidden = true`),
  not by adding inline styles.
- Use `data-*` attributes and event delegation for buttons inside lists
  (see `ADMIN_ACTIONS` in `js/views/admin.js`), not `onclick="..."` in HTML.

### Every view follows the same pattern

Each file in `js/views/` has exactly two public functions:

- `initXxxView()` runs **once** on page load. It connects event listeners.
- `renderXxxView()` runs **every time** the view is shown or data changes.
  It redraws the view from saved data. It must be safe to call many times.

After changing data, call the current view's `render...` function (or
`showView(...)`) so the screen updates. Don't try to patch the page by hand.

To add a new view, follow the steps in the header comment of `js/app.js`.

### HTML

- Every element the JavaScript looks up has an `id`. **Do not rename or
  remove an `id`** without searching `js/` for it and updating every use.
- Prefix ids with their view to avoid clashes: `status-...` for My Status,
  `admin-...` for Staff View. (The check-in form ids like `patient-name` are
  older and fine to keep.)
- No inline `style="..."` attributes. Put styles in the right CSS file.

### CSS

- Always use the color variables from the top of `css/base.css`
  (`var(--accent-color)`), never raw color codes, except in `base.css` itself.
- Put a style in `base.css` only if more than one view uses it. Otherwise put
  it in that view's CSS file.
- Class names are lowercase-with-dashes (`patient-row`, `status-badge`).

---

## 4. Data model

All patients are stored as one list under `localStorage['pulsecheck_patients']`.
Each patient looks like this (the source of truth is the comment at the top of
`js/storage.js`; update both places together):

| Field | Example | Notes |
|---|---|---|
| `id` | `"1695400000000-ab12"` | Unique. Never shown to users. |
| `ticketNumber` | `"T-123"` | Short code shown to the patient. |
| `name` | `"Jane Doe"` | |
| `phone` | `"(555) 123-4567"` | |
| `reason` | `"Routine Checkup"` | Matches an `<option>` in the check-in form. |
| `visitType` | `"walk-in"` | `VISIT_TYPE.WALK_IN` or `VISIT_TYPE.APPOINTMENT`. |
| `appointmentTime` | `"14:30"` or `null` | 24-hour `HH:MM`. Only for appointments. |
| `checkedInAt` | `1695400000000` | `Date.now()` at check-in. |
| `status` | `"waiting"` | `PATIENT_STATUS.WAITING` → `CALLED` → `DONE`. |

Queue rules (in `js/queue.js`):
- Two separate queues: **appointments** (sorted by `appointmentTime`) and
  **walk-ins** (sorted by `checkedInAt`).
- A patient is "in line" while their status is `waiting` or `called`.
- Estimated wait = people ahead × `MINUTES_PER_PATIENT`.

If you change the shape of a patient record, either keep old records working
or tell users to click **Reset All Demo Data** in the Staff View, and say so
in your PR description.

---

## 5. Working as a team (avoiding merge conflicts)

- **Pull the latest `main` before you start**, and again before opening a PR.
- **One feature per branch, one branch per person.** Name branches
  `yourname/short-description` (e.g. `alex/sms-reminder-button`).
- **Keep PRs small.** Several small PRs merge more easily than one big one.
- **Stay in your lane.** Only edit the files your feature needs (see
  section 2). If you must touch a shared file (`base.css`, `storage.js`,
  `index.html`), keep the change small and mention it in the PR description.
- **Don't reformat, re-indent, reorder, or rename code you aren't
  changing.** Cosmetic edits to other people's code are the #1 cause of
  merge conflicts.
- **Add new code at the end of the relevant section**, not in the middle of
  existing code, unless it logically belongs elsewhere.
- **Don't move or rename files** without agreement from the team.
- When resolving a merge conflict, keep **both** sides' features unless one
  is clearly meant to replace the other, and check that every function that
  is called still exists (e.g. search for the function name). A past merge
  deleted a feature but left its function call behind, which broke the page.

---

## 6. Before you open a pull request

1. Open `index.html` by double-clicking it.
2. Open the browser's developer console (F12 → Console) and confirm there are
   **no red errors**.
3. Click through all three views and try the full flow: check a patient in →
   see them on My Status → Call In and Mark Done in Staff View → confirm My
   Status updates.
4. In your PR description, list which files you changed and why, and flag any
   change to a shared file or to the data model.
