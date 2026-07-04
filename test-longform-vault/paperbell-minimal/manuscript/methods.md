# Methods

We use the mass–energy relation $E = mc^2$ as an inline-equation example, and report the sample mean as a display equation:

$$\bar{h}_t = \operatorname{mean}(\{h_{i,t}\}), \quad h_{i,t} \in \mathbb{R}.$$

Blackboard symbols such as $\mathbb{R}$ and $\mathbb{N}$ come from `amssymb`, which the template loads.

Values below are injected at compile time from `results.json` (they are *not* in `metadata.json`, so they stay as raw placeholders in the live reading-mode preview and are only substituted by the compile step): we analysed {{ summary.n }} {{ summary.unit }} with a mean of {{ summary.mean }}, the first of which is identified as {{ samples[0].id }}. The dataset was computed on {{ computed_date }}.
