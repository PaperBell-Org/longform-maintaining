export interface ZenodoCreator {
  name: string;
  affiliation?: string;
  orcid?: string;
  gnd?: string;
}

export interface ZenodoContributor extends ZenodoCreator {
  type?: string;
}

export interface LongformExtras {
  acronym?: string;
  csl?: string;
  template?: string;
  lineno?: boolean;
  figures_at_end?: boolean;
  author_affiliations?: Record<string, string[]>;
  corresponding?: string[];
  extra_yaml?: string;
}

export interface ZenodoMetadata {
  title?: string;
  publication_date?: string;
  description?: string;
  creators?: ZenodoCreator[];
  contributors?: ZenodoContributor[];
  keywords?: string[];
  journal_title?: string;
  version?: string;
  _longform?: LongformExtras;
}

/**
 * Build a Pandoc-style YAML frontmatter from a Zenodo deposition metadata
 * object. Returns the body of the frontmatter (no surrounding `---` lines)
 * and always ends with a newline.
 */
export function buildPandocYaml(metadata: ZenodoMetadata): string {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("[Add Zenodo Frontmatter] Metadata must be a JSON object.");
  }
  if (!metadata.title || typeof metadata.title !== "string") {
    throw new Error(
      "[Add Zenodo Frontmatter] Metadata is missing required field 'title'."
    );
  }
  if (
    !Array.isArray(metadata.creators) ||
    metadata.creators.length === 0 ||
    metadata.creators.some((c) => !c || typeof c.name !== "string" || !c.name)
  ) {
    throw new Error(
      "[Add Zenodo Frontmatter] Metadata is missing required field 'creators' (non-empty array of {name, ...})."
    );
  }

  const ext = metadata._longform ?? {};
  const date =
    metadata.publication_date && metadata.publication_date.length > 0
      ? metadata.publication_date
      : new Date().toISOString().slice(0, 10);

  const correspondingSet = new Set(ext.corresponding ?? []);
  const authorAffiliations = ext.author_affiliations ?? {};

  const affiliationIndex: string[] = [];
  const indexFor = (name: string): number => {
    const i = affiliationIndex.indexOf(name);
    if (i >= 0) return i + 1;
    affiliationIndex.push(name);
    return affiliationIndex.length;
  };

  type AuthorOut = {
    name: string;
    affiliationIndices: number[];
    corresponding: boolean;
  };
  const authorsOut: AuthorOut[] = metadata.creators.map((creator) => {
    const explicit = authorAffiliations[creator.name];
    const affilNames =
      explicit && explicit.length > 0
        ? explicit
        : creator.affiliation
        ? [creator.affiliation]
        : [];
    return {
      name: creator.name,
      affiliationIndices: affilNames.map(indexFor),
      corresponding: correspondingSet.has(creator.name),
    };
  });

  const lines: string[] = [];
  lines.push(`title: ${yamlString(metadata.title)}`);
  lines.push(`date: ${yamlString(date)}`);

  lines.push("authors:");
  for (const a of authorsOut) {
    lines.push(`  - name: ${yamlString(a.name)}`);
    if (a.affiliationIndices.length > 0) {
      lines.push(`    affiliation: [${a.affiliationIndices.join(", ")}]`);
    }
    if (a.corresponding) {
      lines.push(`    corresponding: ${yamlString("yes")}`);
    }
  }

  if (affiliationIndex.length > 0) {
    lines.push("affiliations:");
    affiliationIndex.forEach((name, i) => {
      lines.push(`  - index: ${i + 1}`);
      lines.push(`    name: ${yamlString(name)}`);
    });
  }

  lines.push(`abstract: ${yamlString(metadata.description ?? "")}`);

  if (Array.isArray(metadata.keywords) && metadata.keywords.length > 0) {
    lines.push("keywords:");
    for (const k of metadata.keywords) {
      lines.push(`  - ${yamlString(String(k))}`);
    }
  }

  lines.push(`target: ${yamlString(metadata.journal_title ?? "")}`);
  lines.push(`acronym: ${yamlString(ext.acronym ?? "")}`);
  lines.push(`csl: ${yamlString(ext.csl ?? "")}`);

  if (ext.template) {
    lines.push(`template: ${yamlString(ext.template)}`);
  }
  if (ext.lineno) {
    lines.push(`lineno: ${yamlString("true")}`);
  }
  if (ext.figures_at_end) {
    lines.push(`figures-at-end: ${yamlString("true")}`);
  }

  let body = lines.join("\n") + "\n";
  if (ext.extra_yaml && ext.extra_yaml.length > 0) {
    const extra = ext.extra_yaml.endsWith("\n")
      ? ext.extra_yaml
      : ext.extra_yaml + "\n";
    body += extra;
  }
  return body;
}

/** Quote a value as a YAML double-quoted string, escaping `\` and `"`. */
function yamlString(s: string): string {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
