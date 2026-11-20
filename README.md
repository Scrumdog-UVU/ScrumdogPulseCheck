# ScrumdogPulseCheck

This is the Scrum Simulation Project: **PulseCheck**, a clinic check-in and
patient queue demo.

## How to run it

Double-click `index.html`. That's it. There's nothing to install.

## How to use it

PulseCheck opens in **Patient View**. Use the top bar for patient tasks.
Select **Staff View** in the bottom-right corner to manage the queue. The
corner link then reads **Patient View** and takes you back to check-in.

1. **New Patient**: fill in the form to check in. You'll be taken to My Status.
   At a kiosk, select **Scan QR Code** to fill the form from a clinic-issued QR
   code, then review the details and submit it yourself. In this demo, QR codes
   contain JSON with `name`, `dob` (`YYYY-MM-DD`), `phone`, and `reason` matching
   a check-in option. They may also include `visitType` (`walk-in` or
   `appointment`), `appointmentTime` (`HH:MM` for appointments), and `allergies`.
   Camera permission and a browser with built-in QR scanning support are
   required; the regular form remains available if either is unavailable.
   For example:

   ```json
   {"name":"Jane Doe","dob":"1990-05-15","phone":"555-123-4567","reason":"Routine Checkup"}
   ```

   The QR data is readable text, and this browser-only demo is not for real
   patient information. The patient must agree to the privacy summary and make
   their own optional message-consent choices after scanning.
2. **My Status**: see your ticket, place in line, and estimated wait. Use the
   "Viewing as patient" drop-down to switch between checked-in patients.
   If the patient ticked the notifications box when checking in, a pretend
   push notification ("It's your turn!") pops up here when staff call them in.
   If they ticked the SMS box, a **Text Messages** card shows the pretend
   texts the clinic sent them: "Your turn is coming up!" once 2 or fewer
   people are ahead of them, and "It's your turn!" when they're called in.
3. **Staff View**: see the Scheduled Appointments and Walk-ins queues.
   Use **Check In a Patient by Phone** to enter details for a patient who calls
   ahead; they are added to the appropriate waiting queue with message
   notifications off. **Call In** a patient, then **Mark Done** when their
   visit is over.
4. **Dashboard**: a live, read-only overview for front-desk staff. It shows
   who has been called in, both queues in order, and how long each patient
   has been waiting. Open it in a second browser tab and it updates the
   moment you check someone in or call them from the first tab.

Tip: try the full flow in one sitting. Check a patient in, watch them on
**My Status**, then switch to **Staff View** to call them in and mark them
done. Their status changes right away.

The simulated patient session expires after **60 minutes without activity**.
The app returns to New Patient check-in when the session expires. It uses a
browser cookie when available and a local-storage fallback for browsers that
block cookies on `file://` pages. This is demo behavior, not secure
authentication.

All data is saved only in your browser. Use **Reset All Demo Data** in the
Staff View to start over.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. It explains where code
goes, the commenting rules, and how to avoid merge conflicts.

## Large-text, low-vision display

Use **Low Vision Mode: Off** in the top bar to turn on larger text, stronger
contrast, and clearer keyboard focus outlines throughout the app. The button
changes to **Low Vision Mode: On**; select it again to restore the standard
display. The preference is saved in this browser and works with either Light
Mode or Dark Mode. On small screens, wide staff tables can scroll horizontally.
