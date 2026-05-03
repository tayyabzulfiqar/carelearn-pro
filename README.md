# CareLearn Pro - UK Care Home Training Platform

A full-stack monorepo for managing and delivering training to UK care home staff.

## Structure

```
carelearn-pro/
├── apps/
│   ├── api/          # Node.js + Express REST API
│   └── web/          # Next.js 14 frontend
├── packages/
│   └── shared/       # Shared types and utilities
└── package.json      # Root workspace config
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 8.0.0

### Install dependencies

```bash
npm install
```

### Run in development

```bash
# All apps
npm run dev

# Individual apps
cd apps/api && npm run dev
cd apps/web && npm run dev
```

## Fire Safety Validation

Run the content refresh and validation pipeline:

```bash
npm run fire-safety:import
npm run fire-safety:validate
```

## Packages

| Package | Description |
|---|---|
| `@carelearn/api` | Express REST API backend |
| `@carelearn/web` | Next.js 14 web application |
| `@carelearn/shared` | Shared types and utility functions |
