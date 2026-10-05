import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '.')

describe('UI-TOKEN-SSOT-01 & UI-THEME-01 Architecture Contracts', () => {
  it('enforces canonical CSS import cascade order in index.css', () => {
    const indexCss = readFileSync(path.join(srcRoot, 'index.css'), 'utf8')
    const importRegex = /@import\s+['"]([^'"]+)['"]/g
    const imports = []
    let match
    while ((match = importRegex.exec(indexCss)) !== null) {
      imports.push(match[1])
    }

    const legacyIdx = imports.findIndex((i) => i.endsWith('design-tokens.css'))
    const tokensIdx = imports.findIndex((i) => i.endsWith('/tokens.css') || i === './styles/tokens.css')
    const baseIdx = imports.findIndex((i) => i.endsWith('base.css'))
    const componentsIdx = imports.findIndex((i) => i.endsWith('components.css'))

    expect(legacyIdx, 'design-tokens.css must be imported').toBeGreaterThanOrEqual(0)
    expect(tokensIdx, 'tokens.css must be imported').toBeGreaterThanOrEqual(0)
    expect(baseIdx, 'base.css must be imported').toBeGreaterThanOrEqual(0)
    expect(componentsIdx, 'components.css must be imported').toBeGreaterThanOrEqual(0)

    // Legacy -> tokens -> base -> components
    expect(legacyIdx).toBeLessThan(tokensIdx)
    expect(tokensIdx).toBeLessThan(baseIdx)
    expect(baseIdx).toBeLessThan(componentsIdx)
  })

  it('verifies base.css does not inject duplicate tokens.css import', () => {
    const baseCss = readFileSync(path.join(srcRoot, 'styles', 'base.css'), 'utf8')
    expect(baseCss).not.toContain("@import './tokens.css'")
    expect(baseCss).not.toContain('@import "./tokens.css"')
  })

  it('marks design-tokens.css strictly as legacy compatibility layer without claiming SSOT', () => {
    const designTokensCss = readFileSync(
      path.join(srcRoot, 'styles', 'design-tokens.css'),
      'utf8'
    )
    expect(designTokensCss).toContain('LEGACY COMPATIBILITY TOKENS')
    expect(designTokensCss).not.toContain('MathTutor UI V2 Design Tokens')
  })

  it('verifies tokens.css defines distinct light and dark semantic tokens', () => {
    const tokensCss = readFileSync(path.join(srcRoot, 'styles', 'tokens.css'), 'utf8')
    expect(tokensCss).toContain(':root')
    expect(tokensCss).toContain('html[data-theme="dark"]')
    expect(tokensCss).toContain('html[data-theme="light"]')

    // Parse dark and light values for key semantic tokens
    const darkBlockMatch = tokensCss.match(/(?::root,\s*html\[data-theme=["']dark["']\]|html\[data-theme=["']dark["']\])\s*\{([\s\S]*?)\}/)
    const lightBlockMatch = tokensCss.match(/html\[data-theme=["']light["']\]\s*\{([\s\S]*?)\}/)

    expect(darkBlockMatch).toBeTruthy()
    expect(lightBlockMatch).toBeTruthy()

    const darkBlock = darkBlockMatch[1]
    const lightBlock = lightBlockMatch[1]

    const testTokens = [
      '--color-bg-app',
      '--color-bg-surface',
      '--color-text-primary',
      '--color-border-default',
    ]

    for (const token of testTokens) {
      const darkValMatch = darkBlock.match(new RegExp(`${token}:\\s*([^;]+);`))
      const lightValMatch = lightBlock.match(new RegExp(`${token}:\\s*([^;]+);`))

      expect(darkValMatch, `Dark theme must define ${token}`).toBeTruthy()
      expect(lightValMatch, `Light theme must define ${token}`).toBeTruthy()

      const darkVal = darkValMatch[1].trim()
      const lightVal = lightValMatch[1].trim()

      expect(darkVal).not.toBe(lightVal)
    }
  })

  it('scans UI-R1A components to ensure zero light: variants and zero dark: variants', () => {
    const r1aFiles = [
      path.join(srcRoot, 'components', 'Sidebar.jsx'),
      path.join(srcRoot, 'components', 'TopHeader.jsx'),
      path.join(srcRoot, 'components', 'Layout.jsx'),
      path.join(srcRoot, 'pages', 'LoginPage.jsx'),
    ]

    const uiDir = path.join(srcRoot, 'components', 'ui')
    for (const file of readdirSync(uiDir)) {
      if (file.endsWith('.jsx') && !file.includes('.test.')) {
        r1aFiles.push(path.join(uiDir, file))
      }
    }

    const lightViolations = []
    const darkViolations = []
    const hardcodedColorViolations = []

    // Pattern for hardcoded colors in className (e.g. bg-[#..., text-[#..., border-[#...)
    const hardcodedPattern = /(?:bg|text|border)-\[#(?:[0-9a-fA-F]{3,8})\]/g

    for (const file of r1aFiles) {
      const content = readFileSync(file, 'utf8')
      const relPath = path.relative(srcRoot, file)

      if (content.includes('light:')) {
        lightViolations.push(`${relPath} has light: variant`)
      }
      if (content.includes('dark:')) {
        darkViolations.push(`${relPath} has dark: variant`)
      }

      const matches = content.match(hardcodedPattern)
      if (matches) {
        hardcodedColorViolations.push(`${relPath} has hardcoded color: ${matches.join(', ')}`)
      }
    }

    expect(lightViolations).toEqual([])
    expect(darkViolations).toEqual([])
    expect(hardcodedColorViolations).toEqual([])
  })
})
