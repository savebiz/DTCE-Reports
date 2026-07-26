const fs = require('fs')
const path = require('path')

// ALLOWED FILES:
// 1. Fixed Chrome layer components (intentionally theme-invariant top navigation bar)
// 2. Global CSS token definition files
// 3. This audit script itself
const ALLOWED_FILES = [
  path.normalize('src/components/dashboard-header.tsx'),
  path.normalize('src/app/globals.css'),
  path.normalize('scripts/audit-theme.js')
]

// DISALLOWED PATTERNS IN CANVAS LAYER:
// 1. Raw hex colors: #[0-9a-fA-F]{3,8}
// 2. Hardcoded Tailwind text/bg color utilities that bypass theme tokens:
//    text-white, bg-white, text-black, bg-black, text-slate-*, bg-slate-*
const HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})\b/g
const TAILWIND_HARDCODED_REGEX = /\b(text-white|bg-white|text-black|bg-black|text-slate-\d+|bg-slate-\d+|text-zinc-\d+|bg-zinc-\d+|text-gray-\d+|bg-gray-\d+)\b/g

// STANDARD SHADCN SEMANTIC VARIABLES THAT MUST BE DEFINED IN BOTH :root AND .dark
const REQUIRED_SEMANTIC_VARS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring'
]

let violations = []

// ── 1. Audit CSS Variable Definitions in globals.css ──
function auditCSSVariableMappings() {
  const cssPath = path.join(__dirname, '../src/app/globals.css')
  if (!fs.existsSync(cssPath)) return

  const cssContent = fs.readFileSync(cssPath, 'utf8')

  // Extract :root block
  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s)
  const rootContent = rootMatch ? rootMatch[1] : ''
  const rootVars = new Set(Array.from(rootContent.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)).map(m => m[1]))

  // Extract .dark block
  const darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/s)
  const darkContent = darkMatch ? darkMatch[1] : ''
  const darkVars = new Set(Array.from(darkContent.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)).map(m => m[1]))

  REQUIRED_SEMANTIC_VARS.forEach(varName => {
    if (!rootVars.has(varName)) {
      violations.push({
        file: 'src/app/globals.css',
        line: 1,
        rule: 'Unmapped Semantic Variable in :root (Light Theme)',
        match: `--${varName}`,
        snippet: `Semantic variable --${varName} is missing from :root block in globals.css`
      })
    }
    if (!darkVars.has(varName)) {
      violations.push({
        file: 'src/app/globals.css',
        line: 1,
        rule: 'Unmapped Semantic Variable in .dark (Dark Theme)',
        match: `--${varName}`,
        snippet: `Semantic variable --${varName} is missing from .dark block in globals.css`
      })
    }
  })
}

// ── 2. Audit JS/TSX Source Code ──
function walkDir(dir) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walkDir(fullPath)
      }
    } else if (/\.(tsx|jsx|css)$/.test(file)) {
      checkFile(fullPath)
    }
  }
}

function checkFile(filePath) {
  const normPath = path.normalize(filePath)
  if (ALLOWED_FILES.some(allowed => normPath.endsWith(allowed))) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  lines.forEach((lineText, lineIdx) => {
    // Skip inline comments or explicit audit-disable tags
    if (lineText.includes('audit-disable') || lineText.trim().startsWith('//') || lineText.trim().startsWith('/*') || lineText.trim().startsWith('*')) {
      return
    }

    // Check Hex colors
    const hexMatches = lineText.match(HEX_REGEX)
    if (hexMatches) {
      hexMatches.forEach(hex => {
        violations.push({
          file: filePath,
          line: lineIdx + 1,
          rule: 'Raw Hex Color',
          match: hex,
          snippet: lineText.trim()
        })
      })
    }

    // Check Tailwind hardcoded utilities
    const twMatches = lineText.match(TAILWIND_HARDCODED_REGEX)
    if (twMatches) {
      twMatches.forEach(tw => {
        violations.push({
          file: filePath,
          line: lineIdx + 1,
          rule: 'Hardcoded Tailwind Color Utility',
          match: tw,
          snippet: lineText.trim()
        })
      })
    }
  })
}

console.log('🔍 Running Canvas Theme Token & Semantic Variable Mapping Audit...')

auditCSSVariableMappings()
walkDir(path.join(__dirname, '../src'))

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} theme token violation(s) in Canvas Layer:\n`)
  violations.forEach(v => {
    console.error(`  📍 ${v.file}:${v.line}`)
    console.error(`     Rule: ${v.rule} ("${v.match}")`)
    console.error(`     Snippet: ${v.snippet.substring(0, 100)}\n`)
  })
  process.exit(1)
} else {
  console.log('✅ Canvas Layer Theme Token & Semantic Variable Audit Passed! All semantic variables properly mapped.')
  process.exit(0)
}
