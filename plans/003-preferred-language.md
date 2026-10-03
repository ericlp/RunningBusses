# 003 – Future feature: preferred language (sv, en, fr)

Status: planned, not started.

## Goal

The UI follows the browser's preferred language, with Swedish, English and French translations. The user can override the choice.

## Design

- **Detection:** go through `navigator.languages` in order and take the first whose base language is `sv`, `en` or `fr` (so `fr-CA` gives `fr`). If none match, fall back to Swedish (the source language).
- **Override:** a language picker in settings, stored in localStorage. "Automatic" (follow the browser) is the default and can be re-selected.
- **Strings:** one typed dictionary per language (`src/i18n/sv.ts`, `en.ts`, `fr.ts`). Swedish defines the keys; the other two must have exactly the same keys, enforced by TypeScript. A small `t(key, params)` helper and a React context, with no i18n library unless plurals or formatting get out of hand.
- **Plurals:** use `Intl.PluralRules` for things like "1 etapp / 2 etapper".
- **Numbers and distances:** `Intl.NumberFormat` with the active locale (Swedish and French decimal comma, English decimal point). `formatKm` and `formatDistance` take the locale instead of hard-coding `sv-SE`.
- **Document:** set `<html lang>` on the fly and update the page title.
- **Not translated:** stop names and line labels (they come from Västtrafik). Tag and category labels from `filter.ts` and the status labels are translated.
- **Backups:** exports contain no UI text, so the language does not affect import and export. The language setting itself is a local preference and is not exported.

## Work

1. Move all Swedish strings in `App.tsx`, `Courses.tsx`, `filter.ts` and `course.ts` into `sv.ts`.
2. Add `en.ts` and `fr.ts`; add the detection and the settings picker.
3. Test: the detection order, fallback, same keys in all languages (type-level plus a test), plural forms, and number formatting in each locale.
4. Playwright: open with `locale: 'fr-FR'` and `'en-GB'` and check text and that long French labels do not overflow at 360 px.

## When

Best done before Phase 6 (polish) and before many more strings are added; extracting them gets more expensive with each phase. Suggest doing it right after Phase 3, since Phases 3 and 4 add many new dialogs and messages. Translations are written by the assistant and should be read over by a native speaker if they matter.
