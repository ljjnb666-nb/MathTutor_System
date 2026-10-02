import { expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function sources(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const file = join(path, entry.name)
    return entry.isDirectory() ? sources(file) : /\.(jsx?|css)$/.test(file) && !file.includes('.test.') ? [file] : []
  })
}

it.each(['.', '../frontend-student'])('has a single math authority and root CSS import in %s', (app) => {
  const files = sources(`${app}/src`)
  const cssImports = []
  const htmlWriters = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toMatch(/react-latex-next|safeLatex|normalizeLatexForKaTeX|<Latex/)
    if (source.includes('katex/dist/katex.min.css')) cssImports.push(file.replaceAll('\\', '/'))
    if (source.includes('dangerouslySetInnerHTML')) htmlWriters.push(file.replaceAll('\\', '/'))
    if (source.includes('renderToString')) expect(file.replaceAll('\\', '/')).toMatch(/components\/MathText.jsx$/)
  }
  expect(cssImports).toHaveLength(1)
  expect(cssImports[0]).toMatch(/src\/main.jsx$/)
  expect(htmlWriters).toHaveLength(1)
  expect(htmlWriters[0]).toMatch(/components\/MathText.jsx$/)
  const pkg = JSON.parse(readFileSync(`${app}/package.json`, 'utf8'))
  expect(pkg.dependencies.katex).toBe('0.16.21')
  expect(pkg.dependencies).not.toHaveProperty('react-latex-next')
})

it('panel label styles cannot style KaTeX descendant spans', () => {
  const css = readFileSync('src/index.css', 'utf8')
  expect(css).not.toMatch(/\.v2-(?:preview|import|mistake)-(?:option|note)\s+span\s*[{,]/)
})
