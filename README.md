# 🚀 Plus Sprint Tools (Production Grade)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A professional Miro toolkit for Sprint Planning, Estimation, and Capacity Management, integrated with Jira.

---

## ✨ Key Features

### 🃏 Real-time Planning Poker
- Synchronized voting sessions across multiple board users using **Socket.io**.
- Cast votes for Fibonacci points or effort hours.
- Automated result tallying and point application to Miro cards.

### 🔄 Jira Synchronization
- **Bidirectional Sync**: Fetch status and estimation data from Jira.
- **Batch Updates**: Update multiple Jira issues directly from the Miro board.
- **Secure Auth**: Production-ready OAuth 2.0 (3LO) implementation with secure backend token exchange.

### 📈 Capacity & Attendance
- **Agoda-style Date Picker**: Easily manage team attendance for the sprint.
- **Automated Calculations**: Dynamic capacity calculation based on work hours, ceremony overhead, and team availability.
- **Persistence**: Store capacity data directly on the Miro board metadata.

### 📝 Timesheet & Board Automation
- **Refinement Frames**: Generate structured frames for story refinement with one click.
- **Smart Sticky Notes**: Auto-generate reference stickies for estimation scales.
- **Timesheet Export**: Generate formatted timesheet data based on selected Miro cards.

---

## 🛠️ Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Premium Vanilla CSS (Modern, Dark Mode support)
- **Real-time**: Socket.io + Custom Express Server
- **Authentication**: Jira OAuth 2.0 (3LO)
- **SDK**: Miro Web SDK v2

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your Jira and Miro credentials.
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Open in Miro
- Go to [Miro Developer Hub](https://miro.com/app/dashboard/?tpApp=devhub)
- Set your App URL to `http://localhost:3000`
- Open your board and launch the app from the sidebar.

---

## 🧪 Testing

The project uses **Vitest** for unit testing, along with **React Testing Library** and **MSW** for API mocking.

### Run Tests
```bash
# Run tests once
npm run test:run

# Run tests in watch mode
npm test

# Run tests with coverage report
npm run test:coverage
```

### Writing New Tests
- **Utility Tests**: Place `.test.ts` files alongside the implementation (e.g., `src/utils/math.test.ts`).
- **Component Tests**: Place `.test.tsx` files alongside the component (e.g., `src/components/Button.test.tsx`).
- **API Mocks**: Use `src/test/mocks/handlers.ts` to add new MSW handlers for external API responses.

---

## 📖 Documentation
For detailed setup instructions, including Atlassian and Miro console configuration, please refer to the:
👉 **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

---

## 🔒 Security & Performance
- **Zero Build Errors**: Strict TypeScript checking enforced.
- **Decoupled Config**: No hardcoded keys; all environment-driven.
- **Optimized Rendering**: Uses React 19 concurrent features and efficient Miro SDK polling.
- **Hardened Headers**: CSP and frame-ancestors configured for Miro security.

---

Developed with ❤️ for High-Performance Teams.
