---
title: "A Minimal PaperBell Manuscript"
date: "2026-07-01"
authors:
  - name: "Song, Shuang"
    affiliation: [1, 2]
    corresponding: "yes"
  - name: "Roe, Rick"
    affiliation: [3]
affiliations:
  - index: 1
    name: "Institute for Worked Examples"
  - index: 2
    name: "Aspen Institute"
  - index: 3
    name: "Center for Placeholder Studies"
abstract: "A minimal worked example that exercises every PaperBell writing convention (figures, xlsx tables, citations, math, highlights, footnotes, cross-references, and {{Variable}} placeholders) in one small Longform project, used as a regression fixture while extending the plugin."
keywords:
  - "longform"
  - "paperbell"
  - "pandoc"
  - "example"
target: "Journal of Reproducible Examples"
acronym: "PBMIN"
csl: "nature"
template: "paperbell"
lineno: "true"
numbersections: true
---

# Introduction

Long-form scholarly writing spans several documents that must stay consistent with one another. This minimal example — *A Minimal PaperBell Manuscript* (acronym PBMIN, version v1.0) — exercises every PaperBell writing convention in one small project so that new plugin features can be tested against a stable fixture.

Prior work established the baseline [@doe2020]; later studies extended it [@roe2021; @lee2022]. We ==highlight== the gap those studies leave open: none of them provide an *end-to-end*, **reproducible** worked example.[^scope] The sections that follow state our methods and results.

[^scope]: This footnote demonstrates standard Markdown footnotes, which the PaperBell pipeline renders in the compiled PDF.


# Methods

We use the mass–energy relation $E = mc^2$ as an inline-equation example, and report the sample mean as a display equation:

$$\bar{h}_t = \operatorname{mean}(\{h_{i,t}\}), \quad h_{i,t} \in \mathbb{R}.$$

Blackboard symbols such as $\mathbb{R}$ and $\mathbb{N}$ come from `amssymb`, which the template loads.

Values below are injected at compile time from `results.json` (they are *not* in `metadata.json`, so they stay as raw placeholders in the live reading-mode preview and are only substituted by the compile step): we analysed {{ summary.n }} {{ summary.unit }} with a mean of {{ summary.mean }}, the first of which is identified as {{ samples[0].id }}. The dataset was computed on {{ computed_date }}.


# Results

The primary outcome is shown in @fig:demo; the trend is consistent with the hypothesis stated in the introduction.

![A minimal example figure. {#fig:demo width=70%}](figs/example_figure.png)

Descriptive statistics appear in Table \ref{tbl:demo}, generated from an Excel sheet at compile time by the pipeline's `xlsx_table.lua`.

```xlsx-table
file: figs/example_data.xlsx
sheet: Data
caption: Descriptive statistics for the worked example.
label: tbl:demo
skip_n: 0
```

Full sensitivity analyses are deferred to the supplementary results.
