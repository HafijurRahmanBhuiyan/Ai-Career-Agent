# AI Career Agent

A personal AI-powered career automation platform built with the MERN stack.

## Purpose

AI Career Agent automates career-related workflows including GitHub project analysis, LinkedIn post generation, job discovery, job matching, and career email classification — all powered by Claude AI with human-in-the-loop approval.

## Technology Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router
- **Backend:** Node.js, Express.js, TypeScript
- **Database:** MongoDB, Mongoose
- **AI:** Anthropic Claude API
- **Automation:** n8n

## Current Milestone

**Milestone 1: MERN Project Initialization**

- Project structure created
- Backend Express server with TypeScript
- Frontend React app with Vite, TypeScript, Tailwind CSS
- Health check endpoint
- Basic routing (Landing + Dashboard)

## Project Structure

```
ai-career-agent/
├── client/          # React frontend
├── server/          # Express backend
├── n8n/             # n8n workflow definitions
├── docs/            # Documentation
├── package.json     # Root scripts
├── .gitignore
└── README.md
```

## Local Development

### Prerequisites

- Node.js >= 18
- npm >= 9

### Setup

```bash
# Install all dependencies
npm run install:all

# Copy environment variable files
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Running

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run server   # Backend on port 5001
npm run client   # Frontend on port 5173
```

### Environment Variables

Copy `.env.example` files and fill in values as needed:

- **server/.env** — Backend configuration
- **client/.env** — Frontend configuration

See `.env.example` files for the full list of required variables.

## Status

This project is under active development. Features are being implemented incrementally through milestones.

## License

MIT
