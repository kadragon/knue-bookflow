# Coding Style Guide

## Language
- TypeScript for all source code
- Strict type checking enabled

## Naming Conventions
- **Files**: kebab-case (e.g., `library-api.ts`)
- **Classes**: PascalCase (e.g., `LibraryClient`)
- **Functions**: camelCase (e.g., `renewBook`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_RENEWAL_COUNT`)
- **Interfaces**: PascalCase with 'I' prefix optional (e.g., `BookInfo` or `IBookInfo`)

## Code Organization
```
src/
  index.ts          # Worker entry point
  handlers/         # Request handlers
  services/         # Business logic
  types/            # TypeScript interfaces
  utils/            # Helper functions
```

## Error Handling
- Use custom error classes for domain-specific errors
- Always log errors with context
- Return meaningful error messages

## Comments
- Use JSDoc for public functions
- Inline comments for complex logic only
- All comments in English

## Testing
- Test files: `*.test.ts` alongside source files
- Use Vitest for unit testing
- Mock external API calls in tests
