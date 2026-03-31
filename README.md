# ReminderWork

Simple Vite + React reminder app with:

- Task fields: title, description, category (`Job Scope` / `Ad Hoc`), due date
- Calendar view with tasks by day
- Daily reminders starting 5 days before due date until completed
- Browser Notification API support
- Local persistence using `localStorage`
- Malaysia holiday logic (`date-holidays`) for Kuala Lumpur adjusted submission date

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## GitHub Pages deploy

This repository includes workflows:

- `ci.yml`: build on every push/PR
- `deploy-pages.yml`: build + deploy on push to `main`

Vite base path is configured as:

`/ReminderWork/`

### Required GitHub settings

1. Go to **Settings → Pages**
2. Set **Build and deployment** source to **GitHub Actions**
3. Ensure default branch is `main`

## Notes

- Allow browser notifications when prompted to receive reminders.
- Notifications are delivered while the app is open in the browser.
