import type { App, Plugin } from "obsidian";
import {
  buildPlaceholderRegex,
  formatPlaceholderValue,
  getByPath,
} from "src/compile/steps/replace-json-placeholders-utils";
import { resolveProjectMetadataFile } from "src/model/metadata-resolver";
import VariableEditModal from "./variable-edit-modal";

/** True when a text node is nested inside inline code or a code block. */
function isInCodeOrPre(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    const tag = el.tagName;
    if (tag === "CODE" || tag === "PRE") return true;
    el = el.parentElement;
  }
  return false;
}

function makeVariableSpan(
  app: App,
  metadataFilePath: string,
  path: string,
  value: unknown
): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "longform-variable";
  const defined = value !== undefined;
  const display = defined ? formatPlaceholderValue(value) : `{{${path}}}`;
  span.dataset.longformVarPath = path;
  span.dataset.longformVarDefined = String(defined);
  span.textContent = display;
  span.setAttribute(
    "aria-label",
    `Longform variable: ${path} — double-click to edit`
  );

  span.addEventListener("dblclick", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    new VariableEditModal(app, {
      metadataFilePath,
      varPath: path,
      currentValue: defined ? formatPlaceholderValue(value) : "",
      onSaved: (newDisplay) => {
        const nowDefined = newDisplay !== "";
        span.textContent = nowDefined ? newDisplay : `{{${path}}}`;
        span.dataset.longformVarDefined = String(nowDefined);
      },
    }).open();
  });
  return span;
}

/** Replace every `{{path}}` in a text node with a rendered variable span. */
function renderTextNode(
  textNode: Text,
  regex: RegExp,
  data: Record<string, unknown>,
  metadataFilePath: string,
  app: App
): void {
  const text = textNode.nodeValue ?? "";
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let matched = false;
  const frag = document.createDocumentFragment();

  while ((match = regex.exec(text)) !== null) {
    matched = true;
    const start = match.index;
    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    const path = match[1].trim();
    const value = getByPath(data, path);
    frag.appendChild(makeVariableSpan(app, metadataFilePath, path, value));
    lastIndex = start + match[0].length;
  }

  if (!matched) return;
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  textNode.replaceWith(frag);
}

/**
 * Register a reading-mode post-processor that renders `{{Variable}}`
 * placeholders in Longform project notes as their resolved value from the
 * project's metadata.json, and lets the author double-click a value to edit it.
 */
export function registerVariablePostProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor(async (el, ctx) => {
    // Quick bail before any async work if there's nothing to render.
    if (!el.textContent || !el.textContent.includes("{{")) return;

    const resolved = await resolveProjectMetadataFile(
      plugin.app,
      ctx.sourcePath
    );
    if (!resolved || !resolved.data) return;
    const { file, data } = resolved;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node as Text;
      if (!t.nodeValue || !t.nodeValue.includes("{{")) continue;
      if (isInCodeOrPre(t)) continue;
      textNodes.push(t);
    }

    const regex = buildPlaceholderRegex("{{", "}}");
    for (const textNode of textNodes) {
      renderTextNode(textNode, regex, data, file.path, plugin.app);
    }
  });
}
