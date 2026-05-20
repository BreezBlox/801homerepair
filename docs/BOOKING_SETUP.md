# Website Booking Setup

This site uses Google Calendar Appointment Scheduling instead of a custom Google Calendar API backend.

Current booking URL:

```text
https://calendar.google.com/calendar/appointments/schedules/AcZssZ2kxKBCtIGk3HBPc0VSZe5BjGvlK819vF8KRAuwKWNYpcS-7WZ2igdROIKwA_lW9Uwu9VHWwHHD?gv=true
```

## Why This Setup

- No Google Cloud service account key is required.
- No Netlify environment variables are required.
- Google Calendar handles available times and booking confirmations.
- Busy events on the connected Google Calendar should block those times according to the appointment schedule settings.

## To Change The Booking Page

Update `BOOKING_URL` in `script.js`.

Also update any hard-coded fallback `data-booking-link` URLs in `index.html` if needed.

## Google Calendar Settings To Check

In Google Calendar, open the appointment schedule settings and confirm:

- appointment duration is `1 hour`
- available days and hours are correct
- buffer time is set the way you want
- minimum notice is set the way you want
- the form asks for the customer info you need
- the booking page is public enough for customers to use

## Local Testing

Use any static server:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080` and click `Book a time`.
