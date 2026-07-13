---
longform:
  format: project
  title: PaperBell Minimal
  assets:
    - name: Supplementary
      id: supplementary
      workflow: PaperBell Manuscript
      format: scenes
      folder: supplementary
      scenes:
        - supplementary results
    - name: Response Letter
      id: response-letter
      workflow: PaperBell Response Letter
      format: scenes
      folder: response
      scenes:
        - response
    - name: Main Manuscript
      id: main-manuscript
      workflow: PaperBell Manuscript
      format: scenes
      folder: manuscript
      scenes:
        - introduction
        - methods
        - results
    - name: Cover Letter
      id: cover-letter
      workflow: PaperBell Cover Letter
      format: single
      file: Cover Letter.md
---
