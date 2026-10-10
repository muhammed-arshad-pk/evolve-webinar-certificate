# Webinar Feedback & E-Certificate

Participants fill in the feedback form, then download their Certificate of Participation as a PDF or PNG straight away.

> **Demo mode:** this is a static site, and feedback is **not stored** yet. Saving to Supabase will be added in `saveFeedback()` in `public/app.js`.

## Run locally

```
npm start
```

Then open the URL it prints (usually http://localhost:3000). You can also open `public/index.html` through any static file server.

## Deploy on Vercel

`vercel.json` serves the `public/` folder as a static site. You don't need a build step, server or environment variables.

## Configure

- **Webinar date**: change `webinarDate` at the top of `public/app.js`.
- **Name/date position, font, colour**: see `CONFIG.name` / `CONFIG.date` in the same file (pixel coordinates on the 1001×713 template).
- **Template**: `public/assets/certificate.jpeg`.

## How it works

`public/app.js` checks the form, then draws the name and date onto the template in the browser (canvas, 3× resolution). jsPDF (`public/vendor/`) turns it into a PDF.
