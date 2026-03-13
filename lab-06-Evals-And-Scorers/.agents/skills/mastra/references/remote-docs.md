# Remote Docs Reference

How to look up current documentation from https://mastra.ai when local packages aren't available or you need conceptual guidance.

**Use this when:**

- Mastra packages aren't installed locally
- You need conceptual explanations or guides
- You want the latest documentation (may be ahead of installed version)

## Documentation site structure

Mastra docs are organized at **https://mastra.ai**:

- **Docs**: Core documentation covering concepts, features, and implementation details
- **Models**: Mastra provides a unified interface for working with LLMs across multiple providers
- **Guides**: Step-by-step tutorials for building specific applications
- **Reference**: API reference documentation

## Finding relevant documentation

### Method 1: Use llms.txt (Recommended)

The main llms.txt file provides an agent-friendly overview of all documentation: https://mastra.ai/llms.txt

### Method 2: Direct URL patterns

- Overview pages: `https://mastra.ai/docs/{topic}/overview`
- API reference: `https://mastra.ai/reference/{topic}/`
- Guides: `https://mastra.ai/guides/{topic}/`

## Agent-friendly documentation

Add `.md` to any documentation URL to get clean, agent-friendly markdown.

## Best practices

1. **Always use .md** for fetching documentation
2. **Prefer embedded docs** when packages are installed (version accuracy)
3. **Use remote docs** for conceptual understanding and guides
4. **Combine both** for comprehensive understanding
