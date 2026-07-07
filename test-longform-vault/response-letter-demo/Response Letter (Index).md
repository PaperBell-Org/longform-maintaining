---
longform:
  format: scenes
  title: Response Letter Demo
  draftTitle: Response Letter
  workflow: PaperBell Response Letter
  sceneFolder: source
  scenes:
    - response
  ignoredFiles: []
---

Response letter draft. Compile **PaperBell Manuscript** and **PaperBell Supplementary** first
(to refresh the sidecars), then compile this with **PaperBell Response Letter**: the ```` ```manuscript ````
/ ```` ```SI ```` fences pull the current manuscript text into gray boxes with Page/Line, `@fig:overview`
comes in with the manuscript figure number, and `\ref{fig:validate}` resolves to "Figure S1".
