# ⚔ AoS Warscrolls

A full-stack web app for browsing Age of Sigmar 4th Edition warscrolls, with user authentication and sortable/filterable data from Wahapedia.

## Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3) + JWT auth
- **Frontend**: React + React Router + Axios
- **Data**: Scraped from [Wahapedia](https://wahapedia.ru/aos4/) (community resource)

---

## Setup & Running

### 1. Backend

```bash
cd backend
npm install

# Copy env file and set your JWT secret
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# Start the API server
npm start
# Runs on http://localhost:3001
```

### 2. Populate the Database (Scraper)

In a separate terminal, with the backend dependencies installed:

```bash
cd backend
npm run scrape
```

This will:
- Scrape all 26 AoS4 factions from Wahapedia (~1.5s delay between each)
- Save unit data to `backend/warscrolls.db`
- Takes ~2–3 minutes total

> **Note**: The scraper reads publicly available pages from wahapedia.ru.
> Please don't run it more than once a day to be respectful of their servers.

### 3. Frontend

```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
# Proxies API calls to http://localhost:3001
```

Open http://localhost:3000, register an account, and start browsing!

---

## Features

- **Auth**: User registration + login with JWT (7-day tokens, bcrypt password hashing)
- **Warscroll Table**: All AoS4 units with Name, Faction, Alliance, Move, Health, Control, Save, Points, Type tags, Keywords
- **Sort**: Click any column header to sort ascending/descending
- **Filter by**: Search (name/faction/keyword), Grand Alliance, Faction, Heroes only, Monsters only, Hide Legends
- **Pagination**: 50 units per page with full navigation
- **Links**: Each unit links to its Wahapedia page

---

## Project Structure

```
aos-warscrolls/
├── backend/
│   ├── server.js       # Express API (auth + warscrolls endpoints)
│   ├── db.js           # SQLite schema + helpers
│   ├── scraper.js      # Wahapedia scraper
│   ├── .env.example    # Environment variables template
│   └── package.json
└── frontend/
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js              # Root component + routing
        ├── AuthContext.js      # Auth state management
        ├── styles.css          # Global styles (AoS dark fantasy theme)
        └── pages/
            ├── LoginPage.js
            ├── RegisterPage.js
            └── WarscrollsPage.js   # Main table with filters/sort
```

---

## API Endpoints

All warscroll endpoints require `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/warscrolls` | List warscrolls (filterable, sortable, paginated) |
| GET | `/api/warscrolls/:id` | Single warscroll detail |
| GET | `/api/factions` | List all factions with unit counts |
| GET | `/api/stats` | Total counts by alliance |

### Warscrolls query params

`search`, `faction`, `alliance`, `sortBy`, `sortDir`, `page`, `pageSize`, `isHero`, `isMonster`, `isLegends`

---

## Scraper Notes

The scraper attempts to parse Wahapedia's HTML. Wahapedia occasionally updates their page structure, so if stats (Move/Health/etc.) show as empty after scraping, the HTML selectors in `scraper.js` may need updating for the current page layout. Unit names and faction data should always be captured.

To re-scrape after a layout change:
1. Inspect a unit page on wahapedia.ru
2. Update the selectors in `scraper.js`'s `parseStatBlock()` function
3. Re-run `npm run scrape`
