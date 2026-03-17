# Migration Guide

Guide for upgrading Mastra versions using official documentation and current API verification.

## Migration strategy

### 1. Check official migration docs

**Always start with the official migration documentation:** `https://mastra.ai/llms.txt`

### 2. Use embedded docs for current APIs

After identifying breaking changes, verify the new APIs using embedded docs.

### 3. Use remote docs for latest info

If packages aren't updated yet, check what APIs will look like.

## Quick migration workflow

```bash
# 1. Check current version
npm list @mastra/core

# 2. Fetch migration guide from official docs

# 3. Update dependencies
npm install @mastra/core@latest @mastra/memory@latest @mastra/rag@latest mastra@latest

# 4. Run automated migration (if available)
npx @mastra/codemod@latest v1

# 5. Check embedded docs for new APIs

# 6. Fix breaking changes

# 7. Test
npm run dev
npm test
```

## Key principles

1. **Official docs are source of truth**
2. **Verify with embedded docs**
3. **Update incrementally**
4. **Test thoroughly**
5. **Use automation** - Use codemods when available
