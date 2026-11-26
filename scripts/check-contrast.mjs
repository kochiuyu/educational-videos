/**
 * Contrast and type-size checks for the public stylesheet.
 * Ratios use the WCAG relative-luminance formula against the tokens in
 * src/styles/global.css, including the prefers-color-scheme: dark block.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'src', 'styles', 'global.css');

function linear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const n = Number.parseInt(value.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function braceBlock(css, marker) {
  const at = css.indexOf(marker);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return '';
}

function tokensIn(block) {
  const tokens = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

const PAIRS = [
  ['ink', 'paper', 7, 'body and long descriptions on the page'],
  ['ink', 'sheet', 7, 'body and long descriptions on a card'],
  ['muted', 'paper', 7, 'secondary text on the page'],
  ['muted', 'sheet', 7, 'secondary text on a card'],
  ['muted', 'footer', 7, 'footer and TDLEG credit'],
  ['faint', 'paper', 7, 'meta text on the page'],
  ['faint', 'sheet', 7, 'meta text on a card'],
  ['brick', 'paper', 4.5, 'eyebrow on the page'],
  ['brick', 'sheet', 4.5, 'language note on a card'],
  ['link', 'paper', 4.5, 'links on the page'],
  ['link', 'sheet', 4.5, 'links on a card'],
  ['sand', 'teal', 4.5, 'masthead secondary text'],
  ['on-teal', 'teal', 7, 'masthead links and buttons'],
  ['on-scrim', 'scrim', 7, 'text on a thumbnail scrim'],
  ['tag-ink', 'tag-bg', 7, 'tags'],
];

export function assertContrast(css = fs.readFileSync(cssPath, 'utf8')) {
  const problems = [];
  if (!css.includes('prefers-color-scheme: dark')) problems.push('stylesheet has no dark color scheme');
  if (!css.includes('--measure: 70ch')) problems.push('body measure is not 70ch');
  if (!/body\s*\{[^}]*line-height:\s*1\.6\s*;/s.test(css)) problems.push('body line-height is not 1.6');
  for (const name of ['Noto Sans TC', 'Noto Sans SC', 'PingFang TC', 'PingFang SC', 'Microsoft JhengHei', 'Microsoft YaHei']) {
    if (!css.includes(name)) problems.push(`font stack is missing ${name}`);
  }
  if (!css.includes('.description-body') || !css.includes('overflow-wrap: anywhere')) {
    problems.push('long descriptions do not wrap URLs');
  }
  for (const match of css.matchAll(/font-size:\s*(0\.\d+)rem/g)) {
    const size = Number(match[1]);
    if (size < 0.875) problems.push(`font-size ${match[1]}rem is below 14px`);
  }

  const light = tokensIn(braceBlock(css, ':root {'));
  const darkBlock = braceBlock(css, '@media (prefers-color-scheme: dark)');
  const dark = { ...light, ...tokensIn(darkBlock) };
  for (const [scheme, tokens] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [fg, bg, min, label] of PAIRS) {
      if (!tokens[fg] || !tokens[bg]) {
        problems.push(`${scheme} is missing --${tokens[fg] ? bg : fg}`);
        continue;
      }
      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      if (ratio < min) {
        problems.push(
          `${scheme} ${label} is ${ratio.toFixed(2)}:1 (${tokens[fg]} on ${tokens[bg]}); need ${min}:1`,
        );
      }
    }
  }
  return problems;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const problems = assertContrast();
  if (problems.length) {
    console.error(`contrast check failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log('Contrast OK: light and dark text tokens meet the stated ratios.');
}
