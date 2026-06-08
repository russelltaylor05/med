import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PDFParse } from 'pdf-parse';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out-dir': {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const inputs = positionals.length > 0 ? positionals : ['test_results'];
const pdfFiles = await collectPdfFiles(inputs);

if (pdfFiles.length === 0) {
  console.error('No PDF files found.');
  process.exit(1);
}

if (values['out-dir']) {
  await mkdir(values['out-dir'], { recursive: true });
}

for (const filePath of pdfFiles) {
  const text = await extractPdfText(filePath);

  if (values['out-dir']) {
    const outputPath = textOutputPath(filePath, values['out-dir']);
    await writeFile(outputPath, text, 'utf8');
    console.log(`Extracted ${filePath} -> ${outputPath}`);
  } else {
    console.log(`\n--- ${filePath} ---\n`);
    console.log(text.trimEnd());
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

function textOutputPath(filePath, outputDirectory) {
  const parsed = path.parse(filePath);
  return path.join(outputDirectory, `${parsed.name}.txt`);
}

function isPdf(filePath) {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function printHelp() {
  console.log(`Usage:
  npm run extract -- [file-or-directory ...]
  npm run extract:all

Options:
  --out-dir <directory>  Write extracted text files instead of printing text.
  -h, --help            Show this help text.

Examples:
  npm run extract -- test_results/5-15-2020.pdf
  npm run extract -- test_results --out-dir extracted_text`);
}
