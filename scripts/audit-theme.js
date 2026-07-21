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

let violations = []

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

console.log('🔍 Running Canvas Theme Token Audit...')
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
  console.log('✅ Canvas Layer Theme Token Audit Passed! No hardcoded colors found.')
  process.exit(0)
}
