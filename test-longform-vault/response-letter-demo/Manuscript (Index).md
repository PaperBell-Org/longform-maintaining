---
longform:
  format: scenes
  title: Response Letter Demo
  draftTitle: Main Manuscript
  workflow: PaperBell Manuscript
  sceneFolder: source
  scenes:
    - introduction
    - methods
  ignoredFiles: []
---

Main manuscript draft. Compile with **PaperBell Manuscript** — it exports the PDF and then
harvests line/figure numbers into `manuscript-lines.json` / `figure-numbers.json`. It carries
`<!--ms:-->` spans (`intro-sbs-def`) and a block id (`^disc-records`) for the response letter to cite.
