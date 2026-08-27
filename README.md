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

**Milestone 2: MongoDB + User Authentication**

- MongoDB connection with Mongoose
- User model with password hashing (bcryptjs)
- JWT authentication (register, login, me)
- Role-based authorization foundation (USER, ADMIN)
- Input validation with Zod
- Centralized error handling
- 20 automated tests passing

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

## Prerequisites

- Node.js >= 18
- npm >= 9
- MongoDB >= 6.0 (local or Atlas)

## Local Development

### Setup

```bash
# Install all dependencies
npm run install:all

# Copy environment variable files
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Environment Variables

Edit `server/.env` and set:

- `MONGODB_URI` — MongoDB connection string (e.g., `mongodb://localhost:27017/ai-career-agent`)
- `JWT_SECRET` — A strong random string for JWT signing
- `JWT_EXPIRES_IN` — Token expiration (default: `7d`)

See `server/.env.example` for the full list.

### Running

```bash
# Start MongoDB (if running locally)
mongod

# Start both frontend and backend
npm run dev

# Or start individually
npm run server    # Backend on port 5001
npm run client    # Frontend on port 5173
```

### Testing

```bash
# Run backend tests (uses in-memory MongoDB, no real DB needed)
cd server && npm test
```

## Authentication API

| Method | Endpoint               | Description       | Auth Required |
|--------|------------------------|-------------------|---------------|
| POST   | `/api/auth/register`   | Register new user | No            |
| POST   | `/api/auth/login`      | Login             | No            |
| GET    | `/api/auth/me`         | Get current user  | Yes           |
| GET    | `/api/health`          | Health check      | No            |

### Register

```json
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

### Login

```json
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

### Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>
```

## Status

This project is under active development. Features are being implemented incrementally through milestones.

## License

MIT
