# Webinar Feedback & E-Certificate

Participants fill in the feedback form, then download their Certificate of Participation as a PDF or PNG straight away.

## Run

```
npm install
set ADMIN_KEY=your-secret-password   (PowerShell: $env:ADMIN_KEY="your-secret-password")
npm start
```

Open http://localhost:3000

## Configure

- **Webinar date**: change `webinarDate` at the top of `public/app.js`.
- **Name/date position, font, colour**: see `CONFIG.name` / `CONFIG.date` in the same file (pixel coordinates on the 1001×713 template).
- **Template**: `public/assets/certificate.jpeg`.

## Admin

- Download all feedback as a CSV (opens in Excel): `http://localhost:3000/admin/feedback.csv?key=YOUR_ADMIN_KEY`
- Raw data is stored in `data/feedback.jsonl` (one JSON object per line). Back this file up.

## How it works

- `server.js` (Express): validates and stores feedback, looks up returning participants by email, and exports the CSV.
- `public/app.js`: draws the name and date onto the template in the browser (canvas, 3× resolution). jsPDF turns it into a PDF.
