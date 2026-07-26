# PDF Report Design Brief — Template

Fill this in (delete parts that don't apply) and paste it into a prompt when you want
me to change the PDF reports in `client/src/lib/pdfReports.js`. The more concrete
you are in "Visual direction" and "Reference material", the less guessing I have to do.

---

## 1. Which report(s)?

- [ ] Event Protocol (`generateEventProtocolPdf`) — single meeting/event export
- [ ] Situation Report (`generateSituationReportPdf`) — multi-project status report
- [ ] Both / a new report type: ___

## 2. What's wrong / what's the goal?

One or two sentences. Is this a bug ("X looks broken/cramped"), a polish pass
("make it feel more premium"), or a new capability ("I need a chart of X")?

> ...

## 3. Who reads this, and how?

- Audience: e.g. client-facing execs, internal team, my own archive
- Medium: printed, emailed as PDF, viewed on screen
- Anything that follows from that (e.g. "must look good in black & white print")

> ...

## 4. Content changes

Go section by section. For each, say **keep / change / remove**, and describe the change.
Current sections, so you can reference them by name:

| Section | Where it appears |
|---|---|
| Report header (eyebrow, title, generated date, overall status badge) | Every report |
| Portfolio Health KPI cards | Situation Report cover |
| Project Summary panel (lead, dates, schedule/cost/quality dots) | Situation Report, per project |
| Budget bar | Situation Report, per project |
| Top Risks / Pain Points cards | Both reports |
| Outstanding Actions / Action Items | Both reports |
| Requirements checklist | Situation Report, per project |
| Goals checklist | Situation Report, per project |
| Decisions timeline | Both reports |
| Footer (page numbers, generated date) | Every page |

Example:
> Budget bar — keep. Add a third line showing forecast-at-completion next to spent/planned.
> Requirements checklist — remove per-project; only show a rolled-up count on the cover.

## 5. Visual direction

Be as concrete as you can — words like "cleaner" or "more modern" are hard to act on alone.
Better: name a color, a spacing rule, a reference file/screenshot, or an existing app
screen to match.

- Layout: page size/orientation (currently A4 portrait, 22mm margins), single vs
  multi-column, where page breaks should/shouldn't happen
- Color: current palette is near-black text + grey secondary/borders, with exactly
  four status colors (green/amber/red/blue) reserved for meaning — no per-category
  rainbow coding. Say explicitly if you want to break this rule.
- Typography: currently Inter (regular/semibold/bold) only
- Density: more whitespace vs more compact/data-dense
- Any element you want gone entirely (e.g. "no more circular status dots, use a word")

> ...

## 6. Reference material

Attach or point to whatever exists — a screenshot of a report you like, a competitor's
PDF, a Figma link, a hand sketch, or "make it look like the [X] screen in our own app."
A picture saves paragraphs of description.

> ...

## 7. Hard constraints (things I should NOT change)

Anything currently working that must survive the change — e.g. "keep file naming
convention", "don't touch the Event Protocol layout, only Situation Report", "must
still render with overdue tasks in red."

> ...

## 8. Data availability

Does the change need data the app doesn't currently track (new field on project/task/
risk/etc.)? If you know the data already exists somewhere in the app, name it; if you're
not sure, just describe the info and I'll check the data model.

> ...

## 9. Done looks like

How you'll know it's right — e.g. "generate a report for [project] and the budget
section shows X", or a specific export you'll eyeball.

> ...

---

### Quick version

If a full brief is overkill for a small tweak, this shorthand is enough:

> **Report:** situation report
> **Section:** budget bar
> **Change:** also show forecast-at-completion
> **Why:** PM wants to see projected overrun, not just current spend
