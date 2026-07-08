---
longform:
  format: scenes
  title: PaperBell Minimal
  draftTitle: Response Letter
  workflow: PaperBell Response Letter
  sceneFolder: response
  scenes:
    - response
  ignoredFiles: []
---

Response-letter draft of the same project — exercises the manuscript reference-sync (§ 回复信手稿引用规范).

Compile order: **PaperBell Manuscript** first (it keeps the `<!--ms:intro-gap-->` marker in the compiled note and harvests `manuscript-lines.json` / `figure-numbers.json`), then compile this with **PaperBell Response Letter**. The ```` ```manuscript ```` fences pull the manuscript's current text for `@intro-gap` into a gray box with Page/Line, `@fig:demo` comes in with the manuscript figure number, and `\ref{fig:demo}` resolves to that number.
