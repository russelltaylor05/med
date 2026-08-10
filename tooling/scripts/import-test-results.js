import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PDFParse } from 'pdf-parse';

const DEFAULT_DB_PATH = 'generated/database/medical.sqlite';
const DEFAULT_INPUTS = ['records/labs'];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: {
      type: 'string',
    },
    reset: {
      type: 'boolean',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
});

async function main() {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const dbPath = values.db ?? DEFAULT_DB_PATH;
  const inputs = positionals.length > 0 ? positionals : DEFAULT_INPUTS;
  const pdfFiles = await collectPdfFiles(inputs);

  if (pdfFiles.length === 0) {
    console.error('No PDF files found.');
    process.exit(1);
  }

  await mkdir(path.dirname(dbPath), { recursive: true });

  if (values.reset) {
    await rm(dbPath, { force: true });
  }

  const schemaPath = fileURLToPath(new URL('../database/schema.sql', import.meta.url));
  const schemaSql = await readFile(schemaPath, 'utf8');
  runSql(dbPath, schemaSql);

  const allPanels = [];
  const skippedFiles = [];

  for (const pdfFile of pdfFiles) {
    const text = await extractPdfText(pdfFile);
    const panels = parseLabPdf(text, pdfFile);

    if (panels.length === 0) {
      skippedFiles.push(pdfFile);
      continue;
    }

    allPanels.push(...panels);
    const resultCount = panels.reduce((sum, panel) => sum + panel.results.length, 0);
    console.log(`Parsed ${pdfFile}: ${panels.length} panels, ${resultCount} results`);
  }

  if (allPanels.length > 0) {
    runSql(dbPath, buildImportSql(allPanels));
  }

  const importedResults = allPanels.reduce((sum, panel) => sum + panel.results.length, 0);
  console.log(`Imported ${allPanels.length} panels and ${importedResults} results into ${dbPath}`);

  if (skippedFiles.length > 0) {
    console.log(`Skipped ${skippedFiles.length} PDF(s) without a supported lab format:`);
    for (const skippedFile of skippedFiles) {
      console.log(`- ${skippedFile}`);
    }
  }
}

async function collectPdfFiles(inputsToScan) {
  const files = [];

  for (const input of inputsToScan) {
    const inputStat = await stat(input).catch(() => null);

    if (!inputStat) {
      console.warn(`Skipping missing path: ${input}`);
      continue;
    }

    if (inputStat.isDirectory()) {
      files.push(...await collectPdfFilesFromDirectory(input));
      continue;
    }

    if (isPdf(input)) {
      files.push(input);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function collectPdfFilesFromDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectPdfFilesFromDirectory(entryPath));
      continue;
    }

    if (entry.isFile() && isPdf(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function extractPdfText(filePath) {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function parseLabPdf(text, sourceFile) {
  if (isQuestReport(text)) {
    return parseQuestReport(text, sourceFile);
  }

  if (isTfhdCbcReport(text)) {
    return parseTfhdCbcReport(text, sourceFile);
  }

  return [];
}

function isQuestReport(text) {
  return text.includes('Quest Diagnostics') || /Specimen:\s*[A-Z0-9]+/.test(text);
}

function isTfhdCbcReport(text) {
  return text.includes('CBC WITH DIFFERENTIAL') && text.includes('MyChart - Test Details');
}

function parseQuestReport(text, sourceFile) {
  const lines = nonEmptyLines(text);
  const meta = parseQuestMeta(text, lines, sourceFile);
  const panelsByName = new Map();

  const addResult = (panelName, result) => {
    if (!result) {
      return;
    }

    if (!panelsByName.has(panelName)) {
      panelsByName.set(panelName, {
        ...meta,
        panel_name: panelName,
        panel_status: questPanelStatus(lines, panelName, meta.report_status),
        display_order: panelsByName.size + 1,
        notes: null,
        results: [],
      });
    }

    const panel = panelsByName.get(panelName);
    panel.results.push({
      ...result,
      display_order: panel.results.length + 1,
    });
  };

  for (const config of QUEST_DESIRED_RANGE_RESULTS) {
    addResult(config.panelName, extractDesiredRangeResult(lines, config.testName));
  }

  addResult('Rheumatoid Arthritis Test', extractCcpResult(lines));

  for (const config of QUEST_TAB_RESULTS) {
    addResult(config.panelName, extractTabResult(lines, config));
  }

  const ebvInterpretation = extractQuestEbvInterpretation(lines);
  if (ebvInterpretation) {
    addResult('EPSTEIN BARR VIRUS ANTIBODY PANEL', {
      test_name: 'INTERPRETATION',
      value_text: ebvInterpretation,
      value_operator: null,
      value_number: null,
      unit: null,
      reference_range: null,
      reference_low: null,
      reference_high: null,
      flag: null,
      status: 'gray',
      interpretation: ebvInterpretation,
      notes: null,
    });

    panelsByName.get('EPSTEIN BARR VIRUS ANTIBODY PANEL').notes = ebvInterpretation;
  }

  return [...panelsByName.values()].filter((panel) => panel.results.length > 0);
}

function parseQuestMeta(text, lines, sourceFile) {
  const collectedAt = firstMatch(text, /Collected(?: Date)?:\s*(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2})/);
  const reportedAt = firstMatch(text, /Reported:\s*(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2})/)
    ?? questFooterReportedDate(lines);
  const fasting = firstMatch(text, /Fasting:\s*([YN])/i)
    ?? firstMatch(text, /FASTING:\s*(YES|NO)/i);

  return {
    source_file: sourceFile,
    lab_name: 'Quest Diagnostics',
    specimen_id: firstMatch(text, /Specimen:\s*([A-Z0-9]+)/),
    requisition_id: firstMatch(text, /Requisition:\s*(\S+)/),
    collected_date: isoDateFromDateTime(parseQuestDateTime(collectedAt)),
    collected_at: parseQuestDateTime(collectedAt),
    received_at: parseQuestDateTime(firstMatch(text, /Received:\s*(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2})/)),
    reported_at: parseQuestDateTime(reportedAt),
    fasting: normalizeFasting(fasting),
    report_status: normalizeWhitespace(firstMatch(text, /Report Status:\s*([^\n|]+)/)),
  };
}

const QUEST_DESIRED_RANGE_RESULTS = [
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Glucose (Blood Sugar)' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Urea Nitrogen (BUN)' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Creatinine' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'EGFR' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'BUN/Creatinine Ratio' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Sodium' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Potassium' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Chloride' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Carbon Dioxide' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Calcium' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Protein, Total' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Albumin' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Globulin' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Albumin/Globulin Ratio' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Bilirubin, Total' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Alkaline Phosphatase' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Aspartate Aminotransferase' },
  { panelName: 'Comprehensive Metabolic Panel (CMP)', testName: 'Alanine Aminotransferase' },
  { panelName: 'Vitamin D', testName: 'Vitamin D,25' },
  { panelName: 'Rheumatoid Arthritis Test', testName: 'RHEUMATOID FACTOR' },
  { panelName: 'Rheumatoid Arthritis Test', testName: 'MUTATED CITRULLINATED VIMENTIN (MCV) AB' },
];

const QUEST_TAB_RESULTS = [
  {
    panelName: 'ANA SCREEN, IFA, W/REFL TITER AND PATTERN',
    testName: 'ANA SCREEN, IFA',
  },
  {
    panelName: 'ANTINUCLEAR ANTIBODIES TITER AND PATTERN',
    testName: 'ANA TITER',
    referenceRange: '<1:40 Negative; 1:40-1:80 Low Antibody Level; >1:80 Elevated Antibody Level',
  },
  {
    panelName: 'ANTINUCLEAR ANTIBODIES TITER AND PATTERN',
    testName: 'ANA PATTERN',
    continuationLines: 1,
    interpretation: 'Dense fine speckled pattern noted by Quest.',
  },
  {
    panelName: 'MAGNESIUM',
    testName: 'MAGNESIUM',
  },
  {
    panelName: 'CREATINE KINASE, TOTAL',
    testName: 'CREATINE KINASE, TOTAL',
  },
  {
    panelName: 'HLA-B27 ANTIGEN',
    testName: 'HLA-B27 ANTIGEN',
  },
  {
    panelName: 'C-REACTIVE PROTEIN',
    testName: 'C-REACTIVE PROTEIN',
  },
  {
    panelName: 'LYME DISEASE AB W/REFL TO BLOT (IGG, IGM)',
    testName: 'LYME AB SCREEN',
    referenceRange: '<0.90 INDEX',
  },
  {
    panelName: 'EPSTEIN BARR VIRUS ANTIBODY PANEL',
    testName: 'EBV VIRAL CAPSID AG (VCA) AB (IGM)',
    referenceRange: '<36.00 Negative; 36.00-43.99 Equivocal; >43.99 Positive',
  },
  {
    panelName: 'EPSTEIN BARR VIRUS ANTIBODY PANEL',
    testName: 'EBV VIRAL CAPSID AG (VCA) AB (IGG)',
    referenceRange: '<18.00 Negative; 18.00-21.99 Equivocal; >21.99 Positive',
  },
  {
    panelName: 'EPSTEIN BARR VIRUS ANTIBODY PANEL',
    testName: 'EBV NUCLEAR AG (EBNA) AB (IGG)',
    referenceRange: '<18.00 Negative; 18.00-21.99 Equivocal; >21.99 Positive',
  },
  {
    panelName: 'ACUTE HEPATITIS PANEL (REFL)',
    testName: 'HEPATITIS A IGM',
  },
  {
    panelName: 'ACUTE HEPATITIS PANEL (REFL)',
    testName: 'HEPATITIS B CORE ANTIBODY (IGM)',
  },
  {
    panelName: 'ACUTE HEPATITIS PANEL (REFL)',
    testName: 'HEPATITIS C ANTIBODY',
  },
  {
    panelName: 'ACUTE HEPATITIS PANEL (REFL)',
    testName: 'HEPATITIS B SURFACE ANTIGEN (REFL)',
  },
  {
    panelName: 'TSH',
    testName: 'TSH',
  },
  {
    panelName: 'T4, FREE',
    testName: 'T4, FREE',
  },
  {
    panelName: 'T3, FREE',
    testName: 'T3, FREE',
  },
  {
    panelName: 'THYROID PEROXIDASE ANTIBODIES',
    testName: 'THYROID PEROXIDASE ANTIBODIES',
  },
];

function extractDesiredRangeResult(lines, testName) {
  const index = lines.findIndex((line) => line === testName);

  if (index === -1) {
    return null;
  }

  const rangeLine = lines[index + 1] ?? '';
  if (!rangeLine.startsWith('Desired Range:')) {
    return null;
  }

  const referenceRange = rangeLine.replace(/^Desired Range:\s*/i, '').trim();
  const valueLine = lines[index + 2];

  if (!valueLine) {
    return null;
  }

  return createResult({
    testName,
    rawValue: valueLine,
    referenceRange,
  });
}

function extractCcpResult(lines) {
  const testName = 'CYCLIC CITRULLINATED PEPTIDE (CCP) AB (IGG)';
  const index = lines.findIndex((line) => line === testName);

  if (index === -1) {
    return null;
  }

  const unitLine = lines[index + 1] ?? '';
  const rawValue = lines[index + 2];
  const unit = unitLine.replace(/^Unit of Measure:\s*/i, '').trim() || null;
  const referenceRange = 'Negative: <20; Weak positive: 20-39; Moderate positive: 40-59; Strong positive: >59';

  return createResult({
    testName,
    rawValue,
    referenceRange,
    unit,
    referenceHigh: 20,
  });
}

function extractTabResult(lines, config) {
  const index = lines.findIndex((line) => {
    const cells = splitCells(line);
    return normalizeName(cells[0]) === normalizeName(config.testName) && cells.length >= 2;
  });

  if (index === -1) {
    return null;
  }

  const cells = splitCells(lines[index]);
  let rawValue = cells[1];

  for (let offset = 1; offset <= (config.continuationLines ?? 0); offset += 1) {
    const continuation = lines[index + offset];
    if (continuation && !continuation.includes('\t')) {
      rawValue = `${rawValue} ${continuation}`;
    }
  }

  let referenceRange = config.referenceRange ?? null;
  let unit = config.unit ?? null;

  for (const cell of cells.slice(2)) {
    if (/^Reference Range:/i.test(cell)) {
      referenceRange = cell.replace(/^Reference Range:\s*/i, '').trim();
    } else if (!unit) {
      unit = cell;
    }
  }

  return createResult({
    testName: config.testName,
    rawValue,
    referenceRange,
    unit,
    interpretation: config.interpretation ?? null,
  });
}

function extractQuestEbvInterpretation(lines) {
  const index = lines.findIndex((line) => line === 'INTERPRETATION:');

  if (index === -1) {
    return null;
  }

  const interpretation = lines[index + 1];
  return interpretation && !interpretation.includes('\t') ? interpretation : null;
}

function questPanelStatus(lines, panelName, reportStatus) {
  const panelLine = lines.find((line) => {
    const cells = splitCells(line);
    return normalizeName(cells[0]) === normalizeName(panelName) && cells.length >= 2;
  });

  if (panelLine) {
    const cells = splitCells(panelLine);
    if (/final|pre|pend|re/i.test(cells[1])) {
      return cells[1].toUpperCase();
    }
  }

  return reportStatus;
}

function questFooterReportedDate(lines) {
  for (const line of lines) {
    const cells = splitCells(line);
    const maybeDate = cells.at(-1);
    if (maybeDate && /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(maybeDate)) {
      return maybeDate;
    }
  }

  return null;
}

function parseTfhdCbcReport(text, sourceFile) {
  const lines = nonEmptyLines(text);
  const collectedAt = parseTextDateTime(
    firstMatch(text, /Collected on\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)/)
      ?? firstMatch(text, /Collection date:\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)/),
  );
  const reportedAt = parseTextDateTime(
    firstMatch(text, /Result date:\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)/),
  );
  const labName = firstMatch(text, /Resulting lab:\s*\n([^\n]+)/)
    ?? 'TAHOE FOREST HOSPITAL DISTRICT CLINICAL LAB';
  const reportStatus = firstMatch(text, /Result status:\s*([^\n]+)/);

  const panel = {
    source_file: sourceFile,
    lab_name: normalizeWhitespace(labName),
    specimen_id: null,
    requisition_id: null,
    collected_date: isoDateFromDateTime(collectedAt),
    collected_at: collectedAt,
    received_at: null,
    reported_at: reportedAt,
    fasting: 'unknown',
    report_status: normalizeWhitespace(reportStatus),
    panel_name: 'CBC WITH DIFFERENTIAL',
    panel_status: normalizeWhitespace(reportStatus),
    display_order: 1,
    notes: 'Imported from MyChart test details PDF.',
    results: [],
  };

  for (const testName of TFHD_CBC_TESTS) {
    const result = extractTfhdCbcResult(lines, testName);
    if (result) {
      panel.results.push({
        ...result,
        display_order: panel.results.length + 1,
      });
    }
  }

  return panel.results.length > 0 ? [panel] : [];
}

const TFHD_CBC_TESTS = [
  'WBC',
  'RBC',
  'HEMOGLOBIN',
  'HEMATOCRIT',
  'MCV',
  'MCH',
  'MCHC',
  'RDW',
  'PLATELETS',
  'MPV',
  'NEUTROPHILS',
  'LYMPHOCYTES',
  'MONOCYTES',
  'EOSINOPHILS',
  'BASOPHILS',
  'IMMATURE GRANULOCYTES',
  'NEUTROPHIL ABSOLUTE',
  'LYMPHOCYTE ABSOLUTE',
  'MONOCYTE ABSOLUTE',
  'EOSINOPHIL ABSOLUTE',
  'BASOPHILS ABSOLUTE',
  'IMMATURE GRANULOCYTES ABSOLUTE',
];

function extractTfhdCbcResult(lines, testName) {
  const index = lines.findIndex((line) => line === testName);

  if (index === -1) {
    return null;
  }

  const nextTestIndexes = TFHD_CBC_TESTS
    .filter((name) => name !== testName)
    .map((name) => lines.findIndex((line, lineIndex) => lineIndex > index && line === name))
    .filter((lineIndex) => lineIndex !== -1);
  const endIndex = Math.min(...nextTestIndexes, lines.length);
  const segment = lines.slice(index + 1, endIndex);
  const rangeLine = segment.find((line) => line.startsWith('Normal range:'));

  if (!rangeLine) {
    return null;
  }

  const numericCandidates = segment
    .filter((line) => /^<?-?\d+(?:\.\d+)?$/.test(line));
  const rawValue = numericCandidates.at(-1);

  if (rawValue == null || rawValue === '') {
    return null;
  }

  return createResult({
    testName,
    rawValue,
    referenceRange: rangeLine.replace(/^Normal range:\s*/i, '').trim(),
  });
}

function createResult({
  testName,
  rawValue,
  referenceRange = null,
  unit = null,
  referenceHigh = null,
  interpretation = null,
}) {
  if (!rawValue) {
    return null;
  }

  const parsedValue = parseValue(rawValue);
  const parsedRange = parseReferenceRange(referenceRange);
  const finalUnit = unit ?? parsedRange.unit;
  const finalReferenceHigh = referenceHigh ?? parsedRange.high;
  const status = inferStatus({
    parsedValue,
    referenceLow: parsedRange.low,
    referenceHigh: finalReferenceHigh,
    referenceRange,
  });

  return {
    test_name: testName,
    value_text: parsedValue.valueText,
    value_operator: parsedValue.operator,
    value_number: parsedValue.number,
    unit: finalUnit,
    reference_range: referenceRange,
    reference_low: parsedRange.low,
    reference_high: finalReferenceHigh,
    flag: parsedValue.flag,
    status,
    interpretation,
    notes: null,
  };
}

function parseValue(rawValue) {
  const original = normalizeWhitespace(rawValue);
  let valueText = original;
  let flag = null;

  const flagMatch = valueText.match(/\s+(HIGH|LOW|H|L)$/i);
  if (flagMatch) {
    flag = normalizeFlag(flagMatch[1]);
    valueText = valueText.slice(0, flagMatch.index).trim();
  }

  const operatorMatch = valueText.match(/^(<=|>=|<|>)\s*(.+)$/);
  const operator = operatorMatch ? operatorMatch[1] : null;
  const numericText = operatorMatch ? operatorMatch[2] : valueText;
  const numberMatch = numericText.match(/^-?\d+(?:\.\d+)?$/);

  return {
    valueText,
    operator,
    number: numberMatch ? Number(numericText) : null,
    flag,
  };
}

function parseReferenceRange(referenceRange) {
  if (!referenceRange) {
    return { low: null, high: null, unit: null };
  }

  const text = normalizeWhitespace(referenceRange)
    .replace(/^Reference Range:\s*/i, '')
    .replace(/^Normal range:\s*/i, '')
    .replace(/^Desired Range:\s*/i, '');

  let match = text.match(/^>\s*OR\s*=\s*(-?\d+(?:\.\d+)?)\s*(.*)$/i);
  if (match) {
    return {
      low: Number(match[1]),
      high: null,
      unit: match[2].trim() || null,
    };
  }

  match = text.match(/^(>=|>)\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return {
      low: Number(match[2]),
      high: null,
      unit: match[3].trim() || null,
    };
  }

  match = text.match(/^(<=|<)\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return {
      low: null,
      high: Number(match[2]),
      unit: match[3].trim() || null,
    };
  }

  match = text.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return {
      low: Number(match[1]),
      high: Number(match[2]),
      unit: match[3].trim() || null,
    };
  }

  return { low: null, high: null, unit: null };
}

function inferStatus({ parsedValue, referenceLow, referenceHigh, referenceRange }) {
  if (parsedValue.flag) {
    return 'yellow';
  }

  if (parsedValue.number !== null) {
    if (parsedValue.operator === '<') {
      return referenceHigh === null || parsedValue.number <= referenceHigh ? 'green' : 'yellow';
    }

    if (parsedValue.operator === '<=') {
      return referenceHigh === null || parsedValue.number <= referenceHigh ? 'green' : 'yellow';
    }

    if (parsedValue.operator === '>') {
      return referenceLow === null || parsedValue.number >= referenceLow ? 'green' : 'yellow';
    }

    if (parsedValue.operator === '>=') {
      return referenceLow === null || parsedValue.number >= referenceLow ? 'green' : 'yellow';
    }

    if (referenceLow !== null && parsedValue.number < referenceLow) {
      return 'yellow';
    }

    if (referenceHigh !== null && parsedValue.number > referenceHigh) {
      return 'yellow';
    }

    if (referenceLow !== null || referenceHigh !== null) {
      return 'green';
    }
  }

  const expectedValue = categoricalReferenceValue(referenceRange);
  if (expectedValue) {
    return normalizeName(parsedValue.valueText) === normalizeName(expectedValue) ? 'green' : 'yellow';
  }

  return 'gray';
}

function categoricalReferenceValue(referenceRange) {
  if (!referenceRange) {
    return null;
  }

  const match = referenceRange.match(/Reference Range:\s*([A-Z][A-Z -]+)/i)
    ?? referenceRange.match(/^([A-Z][A-Z -]+)$/i);

  return match ? normalizeWhitespace(match[1]) : null;
}

function buildImportSql(panels) {
  const statements = [
    'PRAGMA foreign_keys = ON;',
    'BEGIN;',
  ];

  for (const panel of panels) {
    statements.push(buildPanelUpsertSql(panel));

    for (const result of panel.results) {
      statements.push(buildResultUpsertSql(panel, result));
    }
  }

  statements.push('COMMIT;');
  return statements.join('\n\n');
}

function buildPanelUpsertSql(panel) {
  const columns = [
    'source_file',
    'lab_name',
    'specimen_id',
    'requisition_id',
    'collected_date',
    'collected_at',
    'received_at',
    'reported_at',
    'fasting',
    'report_status',
    'panel_name',
    'panel_status',
    'display_order',
    'notes',
  ];

  return `
INSERT INTO test_panels (${columns.join(', ')})
VALUES (${columns.map((column) => sqlValue(panel[column])).join(', ')})
ON CONFLICT(lab_name, collected_date, panel_name) DO UPDATE SET
  source_file = excluded.source_file,
  specimen_id = excluded.specimen_id,
  requisition_id = excluded.requisition_id,
  collected_at = excluded.collected_at,
  received_at = excluded.received_at,
  reported_at = excluded.reported_at,
  fasting = excluded.fasting,
  report_status = excluded.report_status,
  panel_status = excluded.panel_status,
  display_order = excluded.display_order,
  notes = excluded.notes,
  updated_at = CURRENT_TIMESTAMP;`.trim();
}

function buildResultUpsertSql(panel, result) {
  const columns = [
    'test_name',
    'value_text',
    'value_operator',
    'value_number',
    'unit',
    'reference_range',
    'reference_low',
    'reference_high',
    'flag',
    'status',
    'interpretation',
    'display_order',
    'notes',
  ];

  return `
INSERT INTO test_results (panel_id, ${columns.join(', ')})
VALUES (
  (SELECT id FROM test_panels
   WHERE lab_name = ${sqlValue(panel.lab_name)}
     AND collected_date = ${sqlValue(panel.collected_date)}
     AND panel_name = ${sqlValue(panel.panel_name)}),
  ${columns.map((column) => sqlValue(result[column])).join(', ')}
)
ON CONFLICT(panel_id, test_name) DO UPDATE SET
  value_text = excluded.value_text,
  value_operator = excluded.value_operator,
  value_number = excluded.value_number,
  unit = excluded.unit,
  reference_range = excluded.reference_range,
  reference_low = excluded.reference_low,
  reference_high = excluded.reference_high,
  flag = excluded.flag,
  status = excluded.status,
  interpretation = excluded.interpretation,
  display_order = excluded.display_order,
  notes = excluded.notes,
  updated_at = CURRENT_TIMESTAMP;`.trim();
}

function runSql(dbPathToUse, sql) {
  const result = spawnSync('sqlite3', ['-batch', dbPathToUse], {
    input: sql,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error([
      `sqlite3 failed for ${dbPathToUse}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
}

function sqlValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function splitCells(line) {
  return line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
}

function nonEmptyLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeName(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function normalizeWhitespace(value) {
  return value == null ? null : String(value).replace(/\s+/g, ' ').trim();
}

function normalizeFlag(flag) {
  const normalized = flag.toUpperCase();

  if (normalized === 'H') {
    return 'HIGH';
  }

  if (normalized === 'L') {
    return 'LOW';
  }

  return normalized;
}

function normalizeFasting(value) {
  if (!value) {
    return 'unknown';
  }

  const normalized = value.toUpperCase();

  if (normalized === 'Y' || normalized === 'YES') {
    return 'yes';
  }

  if (normalized === 'N' || normalized === 'NO') {
    return 'no';
  }

  return 'unknown';
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? normalizeWhitespace(match[1]) : null;
}

function parseQuestDateTime(value) {
  if (!value) {
    return null;
  }

  let match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, month, day, year, hour, minute] = match;
    return `${normalizeYear(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${minute}:00`;
  }

  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${normalizeYear(year)}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

function parseTextDateTime(value) {
  if (!value) {
    return null;
  }

  const match = value.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+([AP]M)$/);
  if (!match) {
    return null;
  }

  const [, monthName, day, year, hourValue, minute, meridiem] = match;
  let hour = Number(hourValue);

  if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  } else if (meridiem === 'PM' && hour !== 12) {
    hour += 12;
  }

  return `${year}-${pad2(monthNumber(monthName))}-${pad2(day)}T${pad2(hour)}:${minute}:00`;
}

function isoDateFromDateTime(value) {
  return value ? value.slice(0, 10) : null;
}

function normalizeYear(year) {
  return year.length === 2 ? `20${year}` : year;
}

function monthNumber(monthName) {
  const months = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12,
  };

  return months[monthName];
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isPdf(filePath) {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function printHelp() {
  console.log(`Usage:
  npm run db:import -- [file-or-directory ...]
  npm run db:rebuild -- [file-or-directory ...]

Options:
  --db <path>  SQLite database path. Defaults to ${DEFAULT_DB_PATH}.
  --reset      Delete the database before importing.
  -h, --help   Show this help text.

Examples:
  npm run db:rebuild
  npm run db:import -- records/labs/2026/2026-06-03-quest-ebv-hepatitis-thyroid-final.pdf`);
}

await main();
