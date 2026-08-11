import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultSourceRoot =
  '/Users/dylan/.copilot/session-state/4ccfcac5-be5f-49c0-b8c1-37123b76767c/files/mamba-ui-source';
const sourceRoot = resolveSourceRoot(process.argv.slice(2));
const componentRoot = path.join(sourceRoot, 'src', 'app', 'components');
const storybookRoot = path.join(repoRoot, 'src', 'storybook', 'mamba');
const copiedSourceRoot = path.join(storybookRoot, 'source');
const generatedRoot = path.join(storybookRoot, 'generated');
const storiesRoot = path.join(repoRoot, 'src', 'stories', 'catalog', 'mamba');

const categoryTitleOverrides = {
  faq: 'FAQ',
  'call-to-action': 'Call to Action',
  'shopping-cart': 'Shopping Cart',
  'skeleton-loader': 'Skeleton Loader',
};

const themeContext = {
  contrast: '-gray-900',
  contrastInv: '-gray-50',
  dark: '-gray-900',
  darkTheme: true,
  default: '-gray-800',
  defaultTone: '-gray-800',
  defaultInv: '-gray-100',
  light: '-gray-100',
  neutral: '-gray-700',
  neutralInv: '-gray-300',
  plain: '-gray-600',
  plainInv: '-gray-400',
  primary: '-blue-400',
  primaryAlt: '-blue-600',
  primaryDark: '-blue-500',
  primaryLight: '-blue-300',
  prose: 'prose prose-invert',
};

const booleanAttributes = new Set([
  'checked',
  'disabled',
  'hidden',
  'readonly',
  'required',
  'selected',
]);

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const expressionCache = new Map();

await ensureDirectory(path.join(storybookRoot));
await fs.rm(copiedSourceRoot, { recursive: true, force: true });
await fs.rm(generatedRoot, { recursive: true, force: true });
await fs.rm(storiesRoot, { recursive: true, force: true });
await ensureDirectory(copiedSourceRoot);
await ensureDirectory(generatedRoot);
await ensureDirectory(storiesRoot);

const sourceMetadata = await readSourceMetadata(sourceRoot);
const categories = await discoverCategories(componentRoot);
const categoryRecords = [];
let totalVariantCount = 0;

for (const category of categories) {
  const showcaseMeta = await readShowcaseMetadata(category.path, category.slug);
  const variants = await discoverVariants(category.path, showcaseMeta);
  const categoryTitle = getCategoryTitle(category.slug);
  const storyTitle = `Catalog/Mamba/${categoryTitle}`;
  const sourceCategoryRoot = path.join(copiedSourceRoot, category.slug);
  await ensureDirectory(sourceCategoryRoot);

  const entries = [];
  for (const variant of variants) {
    const upstreamHtmlPath = path.join(
      category.path,
      variant.id,
      `${variant.id}.component.html`,
    );
    const upstreamTsPath = path.join(category.path, variant.id, `${variant.id}.component.ts`);
    const copiedHtmlPath = path.join(sourceCategoryRoot, `${variant.id}.component.html`);
    const copiedTsPath = path.join(sourceCategoryRoot, `${variant.id}.component.ts`);

    const [rawHtml, rawTs] = await Promise.all([
      fs.readFile(upstreamHtmlPath, 'utf8'),
      fs.readFile(upstreamTsPath, 'utf8'),
    ]);
    const normalizedHtml = normalizeText(rawHtml);
    const normalizedTs = normalizeText(rawTs);

    await Promise.all([
      fs.writeFile(copiedHtmlPath, normalizedHtml),
      fs.writeFile(copiedTsPath, normalizedTs),
    ]);

    const componentContext = extractComponentContext(normalizedTs);
    const renderedHtml = renderAngularTemplate(normalizedHtml, {
      ...themeContext,
      ...componentContext,
    });

    entries.push({
      centered: variant.centered,
      id: variant.id,
      renderedHtml,
      sourceHtmlPath: toRepoRelative(copiedHtmlPath),
      sourceTsPath: toRepoRelative(copiedTsPath),
      storyName: variant.id,
      upstreamHtmlPath: toPosixPath(path.relative(sourceRoot, upstreamHtmlPath)),
      upstreamTsPath: toPosixPath(path.relative(sourceRoot, upstreamTsPath)),
    });
  }

  totalVariantCount += entries.length;
  categoryRecords.push({
    slug: category.slug,
    storyTitle,
    title: categoryTitle,
    variants: entries,
  });
}

await Promise.all(
  categoryRecords.flatMap((category) => [
    writeCategoryDataFile(category),
    writeCategoryStoryFile(category),
  ]),
);
await writeIndexFile(categoryRecords, {
  ...sourceMetadata,
  componentCategoryCount: categoryRecords.length,
  componentVariantCount: totalVariantCount,
});

console.log(
  `Generated ${totalVariantCount} Mamba UI variants across ${categoryRecords.length} component categories.`,
);

function resolveSourceRoot(argv) {
  let explicit;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source') {
      explicit = argv[index + 1];
      break;
    }

    if (argument.startsWith('--source=')) {
      explicit = argument.slice('--source='.length);
      break;
    }
  }

  const root = explicit ?? process.env.MAMBA_SOURCE_ROOT ?? defaultSourceRoot;
  return path.resolve(root);
}

async function discoverCategories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      path: path.join(root, entry.name),
      slug: entry.name,
    }))
    .sort((left, right) => collator.compare(left.slug, right.slug));
}

async function readShowcaseMetadata(categoryPath, categorySlug) {
  const showcasePath = path.join(categoryPath, `${categorySlug}-showcase.component.html`);
  try {
    const showcaseHtml = await fs.readFile(showcasePath, 'utf8');
    const cleaned = showcaseHtml.replace(/<!--[\s\S]*?-->/g, '');
    const regex = /<custom-show-code([^>]*)>\s*<custom-([a-z0-9-]+)>/gms;
    const metadata = new Map();
    let match;
    let index = 0;
    while ((match = regex.exec(cleaned))) {
      metadata.set(match[2], {
        centered: /\[centered\]="true"/.test(match[1] ?? ''),
        order: index,
      });
      index += 1;
    }
    return metadata;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

async function discoverVariants(categoryPath, showcaseMeta) {
  const entries = await fs.readdir(categoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      centered: showcaseMeta.get(entry.name)?.centered ?? false,
      id: entry.name,
      order: showcaseMeta.get(entry.name)?.order ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return collator.compare(left.id, right.id);
    });
}

function getCategoryTitle(slug) {
  if (categoryTitleOverrides[slug]) {
    return categoryTitleOverrides[slug];
  }

  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractComponentContext(sourceText) {
  const sourceFile = ts.createSourceFile(
    'component.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const context = {};
  const classDeclaration = sourceFile.statements.find(ts.isClassDeclaration);

  if (!classDeclaration) {
    return context;
  }

  for (const member of classDeclaration.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name) && member.initializer) {
      context[member.name.text] = evaluateTsExpression(member.initializer, context);
    }

    if (ts.isConstructorDeclaration(member) && member.body) {
      for (const statement of member.body.statements) {
        if (
          ts.isExpressionStatement(statement) &&
          ts.isBinaryExpression(statement.expression) &&
          statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(statement.expression.left) &&
          statement.expression.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
          ts.isIdentifier(statement.expression.left.name)
        ) {
          context[statement.expression.left.name.text] = evaluateTsExpression(
            statement.expression.right,
            context,
          );
        }
      }
    }
  }

  return context;
}

function evaluateTsExpression(node, context) {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluateTsExpression(element, context));
  }

  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        value[getPropertyName(property.name)] = evaluateTsExpression(property.initializer, context);
      }
    }
    return value;
  }

  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    return node.operator === ts.SyntaxKind.MinusToken
      ? -Number(node.operand.text)
      : Number(node.operand.text);
  }

  if (ts.isIdentifier(node)) {
    return context[node.text];
  }

  if (ts.isPropertyAccessExpression(node)) {
    const target = evaluateTsExpression(node.expression, context);
    return target?.[node.name.text];
  }

  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
    return new Date();
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const target = evaluateTsExpression(node.expression.expression, context);
    const methodName = node.expression.name.text;
    if (target instanceof Date && methodName === 'getFullYear') {
      return target.getFullYear();
    }
  }

  throw new Error(`Unsupported TypeScript expression in generator: ${node.getText()}`);
}

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  throw new Error(`Unsupported property name in generator: ${name.getText()}`);
}

function renderAngularTemplate(rawHtml, scope) {
  const root = parse(rawHtml, {
    comment: false,
    preserveTagNesting: true,
  });

  const rendered = root.childNodes.map((node) => renderNode(node, scope)).join('');
  return postProcessRenderedHtml(rendered.trim());
}

function renderNode(node, scope) {
  if (node.nodeType === 8) {
    return '';
  }

  if (node.nodeType === 3) {
    return replaceTextInterpolations(node.rawText, scope);
  }

  const loopExpression = node.getAttribute('ngFor') ?? node.getAttribute('*ngFor');
  if (loopExpression) {
    const { itemName, collectionExpression, indexName } = parseNgForExpression(loopExpression);
    const collection = evaluateAngularExpression(collectionExpression, scope);

    if (!Array.isArray(collection)) {
      throw new Error(`Expected an array in *ngFor expression: ${loopExpression}`);
    }

    return collection
      .map((item, index) =>
        renderElement(node, {
          ...scope,
          [itemName]: item,
          ...(indexName ? { [indexName]: index } : {}),
        }, true),
      )
      .join('');
  }

  return renderElement(node, scope, false);
}

function parseNgForExpression(expression) {
  const match = expression
    .replace(/\s+/g, ' ')
    .trim()
    .match(/^let\s+(\w+)\s+of\s+(.+?)(?:;\s*let\s+(\w+)\s*=\s*index)?$/);

  if (!match) {
    throw new Error(`Unsupported *ngFor expression: ${expression}`);
  }

  return {
    collectionExpression: match[2],
    indexName: match[3],
    itemName: match[1],
  };
}

function renderElement(element, scope, ignoreNgFor) {
  const tagName = element.rawTagName.toLowerCase();
  const classTokens = new Set(
    splitClassTokens(replaceAttributeInterpolations(element.getAttribute('class') ?? '', scope)),
  );
  const dynamicClassExpression = element.getAttribute('[ngClass]');
  if (dynamicClassExpression) {
    for (const token of collectClassTokens(evaluateAngularExpression(dynamicClassExpression, scope))) {
      classTokens.add(token);
    }
  }

  const attributes = [];

  for (const [name, rawValue] of Object.entries(element.attributes)) {
    if (name === 'class' || name === '[ngClass]' || name === 'ngFor' || name === '*ngFor') {
      continue;
    }

    if (name.startsWith('(') && name.endsWith(')')) {
      continue;
    }

    if (name === '[routerLink]') {
      const route = normalizeRouteValue(evaluateAngularExpression(rawValue, scope));
      attributes.push(`data-router-link="${escapeAttribute(route)}"`);
      attributes.push('href="#"');
      continue;
    }

    if (name.startsWith('[') && name.endsWith(']')) {
      const boundName = name.slice(1, -1);
      if (boundName === 'class') {
        for (const token of collectClassTokens(evaluateAngularExpression(rawValue, scope))) {
          classTokens.add(token);
        }
        continue;
      }

      if (boundName.startsWith('attr.')) {
        appendAttribute(attributes, boundName.slice(5), evaluateAngularExpression(rawValue, scope));
        continue;
      }

      appendAttribute(attributes, boundName, evaluateAngularExpression(rawValue, scope));
      continue;
    }

    if (name.startsWith('attr.')) {
      attributes.push(
        `${name.slice(5)}="${escapeAttribute(replaceAttributeInterpolations(rawValue, scope))}"`,
      );
      continue;
    }

    attributes.push(
      `${name}="${escapeAttribute(replaceAttributeInterpolations(rawValue, scope))}"`,
    );
  }

  if (classTokens.size > 0) {
    attributes.unshift(`class="${escapeAttribute([...classTokens].join(' '))}"`);
  }

  const attributeBlock = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  if (voidElements.has(tagName)) {
    return `<${tagName}${attributeBlock}>`;
  }

  const childrenHtml = element.childNodes.map((child) => renderNode(child, scope)).join('');
  return `<${tagName}${attributeBlock}>${childrenHtml}</${tagName}>`;
}

function appendAttribute(attributes, name, value) {
  if (value === null || value === undefined || value === false) {
    return;
  }

  if (typeof value === 'boolean' && booleanAttributes.has(name)) {
    attributes.push(name);
    return;
  }

  attributes.push(`${name}="${escapeAttribute(String(value))}"`);
}

function normalizeRouteValue(value) {
  if (Array.isArray(value)) {
    return value.flat().filter(Boolean).join('');
  }

  return String(value ?? '#');
}

function splitClassTokens(value) {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function collectClassTokens(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectClassTokens(entry));
  }

  if (typeof value === 'string') {
    return splitClassTokens(value);
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .flatMap(([tokenList]) => splitClassTokens(tokenList));
  }

  return [];
}

function evaluateAngularExpression(expression, scope) {
  const normalized = normalizeAngularExpression(expression);
  let evaluator = expressionCache.get(normalized);

  if (!evaluator) {
    evaluator = new Function('scope', `with (scope) { return (${normalized}); }`);
    expressionCache.set(normalized, evaluator);
  }

  try {
    return evaluator(scope);
  } catch (error) {
    throw new Error(`Unable to evaluate Angular expression \`${normalized}\`: ${error}`);
  }
}

function normalizeAngularExpression(expression) {
  const sourceText = expression.replace(/\bthis\./g, '').trim();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    sourceText,
  );
  const parts = [];
  let token = scanner.scan();

  while (token !== ts.SyntaxKind.EndOfFileToken) {
    parts.push(token === ts.SyntaxKind.DefaultKeyword ? 'defaultTone' : scanner.getTokenText());
    token = scanner.scan();
  }

  return parts.join('');
}

function replaceAttributeInterpolations(rawValue, scope) {
  if (!rawValue.includes('{{')) {
    return rawValue;
  }

  return rawValue.replace(/\{\{([^}]+)\}\}/g, (_, expression) => {
    const value = evaluateAngularExpression(expression, scope);
    return String(value ?? '');
  });
}

function replaceTextInterpolations(rawValue, scope) {
  if (!rawValue.includes('{{')) {
    return rawValue;
  }

  return rawValue.replace(/\{\{([^}]+)\}\}/g, (_, expression) => {
    const value = evaluateAngularExpression(expression, scope);
    return escapeHtml(String(value ?? ''));
  });
}

function postProcessRenderedHtml(renderedHtml) {
  return renderedHtml
    .replace(/-custom-dark/g, '-gray-900')
    .replace(/-custom-light/g, '-gray-100')
    .replace(/\bdark:/g, '');
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function writeCategoryDataFile(category) {
  const constantName = `${toCamelCase(category.slug)}Category`;
  const filePath = path.join(generatedRoot, `${category.slug}.generated.ts`);
  const entries = category.variants
    .map(
      (entry) => `    {
      id: ${JSON.stringify(entry.id)},
      storyName: ${JSON.stringify(entry.storyName)},
      centered: ${entry.centered},
      sourceHtmlPath: ${JSON.stringify(entry.sourceHtmlPath)},
      sourceTsPath: ${JSON.stringify(entry.sourceTsPath)},
      upstreamHtmlPath: ${JSON.stringify(entry.upstreamHtmlPath)},
      upstreamTsPath: ${JSON.stringify(entry.upstreamTsPath)},
      renderedHtml: ${toTemplateLiteral(entry.renderedHtml)},
    }`,
    )
    .join(',\n');

  const contents = `import type { MambaCategoryData } from '../types';

// Generated by scripts/generate-mamba-storybook.mjs. Do not edit manually.
export const ${constantName}: MambaCategoryData = {
  slug: ${JSON.stringify(category.slug)},
  title: ${JSON.stringify(category.title)},
  storyTitle: ${JSON.stringify(category.storyTitle)},
  variants: [
${entries}
  ],
};
`;

  await fs.writeFile(filePath, normalizeText(contents));
}

async function writeCategoryStoryFile(category) {
  const fileName = `${toPascalCase(category.slug)}.stories.tsx`;
  const filePath = path.join(storiesRoot, fileName);
  const constantName = `${toCamelCase(category.slug)}Category`;
  const variantsBlock = category.variants
    .map((entry, index) => {
      const exportName = toPascalCase(entry.id);
      return `export const ${exportName} = {
  name: ${JSON.stringify(entry.storyName)},
  render: () => <MambaSnapshot entry={variants[${index}]} />,
  parameters: {
    docs: {
      source: {
        code: variants[${index}].renderedHtml,
      },
    },
  },
};`;
    })
    .join('\n\n');

  const contents = `import { MambaSnapshot } from '../../../storybook/mamba/MambaSnapshot';
import { ${constantName} } from '../../../storybook/mamba/generated/${category.slug}.generated';

// Generated by scripts/generate-mamba-storybook.mjs. Do not edit manually.
const meta = {
  title: ${JSON.stringify(category.storyTitle)},
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

const { variants } = ${constantName};

${variantsBlock}
`;

  await fs.writeFile(filePath, normalizeText(contents));
}

async function writeIndexFile(categories, metadata) {
  const filePath = path.join(generatedRoot, 'index.generated.ts');
  const categorySummaries = categories
    .map(
      (category) => `  {
    slug: ${JSON.stringify(category.slug)},
    title: ${JSON.stringify(category.title)},
    storyTitle: ${JSON.stringify(category.storyTitle)},
    variantCount: ${category.variants.length},
  }`,
    )
    .join(',\n');

  const contents = `import type { MambaCategorySummary, MambaSourceMetadata } from '../types';

// Generated by scripts/generate-mamba-storybook.mjs. Do not edit manually.
export const mambaSourceMeta: MambaSourceMetadata = {
  repoUrl: ${JSON.stringify(metadata.repoUrl)},
  version: ${JSON.stringify(metadata.version)},
  commit: ${JSON.stringify(metadata.commit)},
  commitDate: ${JSON.stringify(metadata.commitDate)},
  componentCategoryCount: ${metadata.componentCategoryCount},
  componentVariantCount: ${metadata.componentVariantCount},
  generatedAt: ${JSON.stringify(metadata.generatedAt)},
  sourceRoot: ${JSON.stringify(metadata.sourceRoot)},
};

export const mambaCategorySummaries: MambaCategorySummary[] = [
${categorySummaries}
];
`;

  await fs.writeFile(filePath, normalizeText(contents));
}

async function readSourceMetadata(root) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  return {
    commit: runGit(root, ['rev-parse', 'HEAD']),
    commitDate: runGit(root, ['log', '-1', '--format=%cI']),
    generatedAt: new Date().toISOString(),
    repoUrl: 'https://github.com/Microwawe/mamba-ui',
    sourceRoot: toPosixPath(root),
    version: packageJson.version ?? 'unknown',
  };
}

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function toTemplateLiteral(value) {
  return `String.raw\`${normalizeText(value)
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')}\``;
}

function normalizeText(value) {
  return value.replace(/[ \t]+$/gm, '').replace(/\n*$/, '\n');
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function toRepoRelative(value) {
  return toPosixPath(path.relative(repoRoot, value));
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}
