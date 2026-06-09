import { readSheet } from 'read-excel-file/browser';
import { base64ToArrayBuffer, base64ToUint8Array } from '../shared/base64';


const PROMPT_HEADER_PATTERN = /^(prompt|prompts|instruction|text)$/i;

export async function parsePromptFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || file.mimeType === 'text/csv') {
    return parsePromptCsv(decodeText(file.dataBase64));
  }

  const rows = (await readSheet(base64ToArrayBuffer(file.dataBase64))).map((row) =>
  row.map((cell) => cell === null || cell === undefined ? '' : String(cell))
  );

  return rowsToPromptItems(rows);
}

export function parsePromptCsv(csv) {
  if (isSingleColumnPromptList(csv)) {
    return rowsToPromptItems(parseSingleColumnPromptList(csv));
  }

  return rowsToPromptItems(parseCsv(csv));
}

export function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => value.trim().length > 0));
}

export function rowsToPromptItems(rows) {
  if (rows.length === 0) return [];

  const header = rows[0].map(normalizeHeaderCell);
  const promptColumn = header.findIndex((cell) => PROMPT_HEADER_PATTERN.test(cell));
  const hasHeader = promptColumn >= 0;
  const sourceRows = hasHeader ? rows.slice(1) : rows;
  const columnIndex = hasHeader ? promptColumn : -1;
  const prompts = [];

  for (const row of sourceRows) {
    const text =
    columnIndex >= 0 ?
    row[columnIndex]?.trim() :
    row.find((cell) => cell.trim().length > 0)?.trim();

    if (!text) continue;

    prompts.push({
      index: prompts.length + 1,
      label: `Prompt-${prompts.length + 1}`,
      text
    });
  }

  return prompts;
}

function isSingleColumnPromptList(csv) {
  const firstLine = csv.split(/\r\n|\n|\r/).find((line) => line.trim().length > 0);

  return PROMPT_HEADER_PATTERN.test(normalizeSingleColumnHeaderLine(firstLine ?? ''));
}

function parseSingleColumnPromptList(csv) {
  const records = [];
  let i = 0;

  if (csv.charCodeAt(0) === 0xfeff) i = 1;

  while (i < csv.length) {
    const recordStart = i;
    let value = '';
    let isQuotedRecord = false;

    while (csv[i] === ' ' || csv[i] === '\t') i += 1;

    const quotedRecord = csv[i] === '"' ? readQuotedPromptRecord(csv, i) : null;
    if (quotedRecord) {
      isQuotedRecord = true;
      value = quotedRecord.value;
      i = quotedRecord.nextIndex;
    } else {
      while (i < csv.length && csv[i] !== '\n' && csv[i] !== '\r') {
        value += csv[i];
        i += 1;
      }
    }

    if (i < csv.length) {
      if (csv[i] === '\r' && csv[i + 1] === '\n') i += 2;else
      i += 1;
    }

    const isBlankUnquotedRecord = !isQuotedRecord && csv.slice(recordStart, i).trim().length === 0;
    if (!isBlankUnquotedRecord) records.push(value);
  }

  return records.map((record) => [record]);
}

function readQuotedPromptRecord(
csv,
startIndex)
{
  let value = '';
  let i = startIndex + 1;

  while (i < csv.length) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && next === '"') {
      value += '"';
      i += 2;
      continue;
    }

    if (char === '"') {
      i += 1;
      while (csv[i] === ' ' || csv[i] === '\t') i += 1;

      if (i >= csv.length || csv[i] === '\n' || csv[i] === '\r') {
        return { value, nextIndex: i };
      }

      return null;
    }

    value += char;
    i += 1;
  }

  return null;
}

function normalizeHeaderCell(cell) {
  return cell.
  replace(/^\uFEFF/, '').
  trim().
  toLowerCase();
}

function normalizeSingleColumnHeaderLine(line) {
  const normalized = normalizeHeaderCell(line);
  const quotedHeader = normalized.startsWith('"') ? readQuotedPromptRecord(normalized, 0) : null;

  return quotedHeader && quotedHeader.nextIndex >= normalized.length ?
  normalizeHeaderCell(quotedHeader.value) :
  normalized;
}

function decodeText(base64) {
  const bytes = base64ToUint8Array(base64);
  return new TextDecoder('utf-8').decode(bytes);
}