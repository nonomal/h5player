module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'domain-no-runtime-dependencies',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^(src/(infrastructure|runtime|ui)|entrypoints)' }
    },
    {
      name: 'domain-no-framework-dependencies',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '(^|/)(vue|wxt)(/|$)' }
    }
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.vue', '.js', '.mjs']
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' }
    }
  }
}
