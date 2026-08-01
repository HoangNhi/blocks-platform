'use strict';

function parseJsonOutput(output) {
  if (typeof output !== 'string') {
    return output;
  }

  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('Empty output');
  }

  if (trimmed.startsWith('```')) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }
  }

  return JSON.parse(trimmed);
}

function normalize(value) {
  return String(value).toLowerCase();
}

function flatten(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(flatten).join('\n');
  }
  return Object.entries(value)
    .map(([key, nested]) => `${key}: ${flatten(nested)}`)
    .join('\n');
}

function getCodexMetadata(context) {
  const metadata = context?.providerResponse?.metadata || context?.response?.metadata || {};
  return metadata.codexAppServer || metadata.codex_app_server || null;
}

function countCommandItems(context) {
  const codex = getCodexMetadata(context);
  if (!codex) {
    return null;
  }

  const counts = codex.itemCounts || codex.item_counts;
  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (/command|exec|shell/i.test(key) && typeof value === 'number') {
        return value;
      }
    }
  }

  const items = codex.items || context?.providerResponse?.raw?.items || [];
  if (Array.isArray(items)) {
    return items.filter((item) => /command|exec|shell/i.test(JSON.stringify(item))).length;
  }

  return null;
}

module.exports = (output, context) => {
  let parsed;
  try {
    parsed = parseJsonOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Output is not valid JSON: ${error.message}`,
    };
  }

  const failures = [];
  const text = normalize(flatten(parsed));
  const vars = context?.vars || {};

  if (parsed.caseId !== vars.case_id) {
    failures.push(`caseId expected ${vars.case_id}, got ${parsed.caseId}`);
  }

  const expectedTerms = Array.isArray(vars.expected_terms)
    ? vars.expected_terms
    : String(vars.expected_terms || '')
        .split('|')
        .map((term) => term.trim())
        .filter(Boolean);

  for (const term of expectedTerms) {
    if (!text.includes(normalize(term))) {
      failures.push(`Missing expected term: ${term}`);
    }
  }

  const commandCount = countCommandItems(context);
  if (commandCount !== null && Number.isFinite(vars.max_command_items)) {
    if (commandCount > vars.max_command_items) {
      failures.push(`Command item count ${commandCount} exceeds max ${vars.max_command_items}`);
    }
  }

  return {
    pass: failures.length === 0,
    score: failures.length === 0 ? 1 : 0,
    reason: failures.length === 0 ? 'Workflow contract satisfied.' : failures.join('; '),
  };
};
