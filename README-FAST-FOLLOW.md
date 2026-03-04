# Fast Follow — Planned Improvements

## Payment Tracking Dashboard

The backend already has `fees` and `payments` tables, plus admin API routes for recording payments. What's missing:

- **Per-player payment status view**: Show who has paid, who owes, for each fee (tournament entry, league dues)
- **Pot calculation**: For tournaments, auto-calculate the prize pot based on collected fees minus the no-show buffer
- **Refund tracking**: If someone withdraws, track partial refunds
- **Payment reminders**: Cron-triggered email reminders for overdue fees (similar to RSVP reminders)
- **Player self-service**: Let players mark "I paid via Venmo/Zelle" so captains can verify

## Push Notifications (Native App)

Web Push has browser limitations (Safari requires user to "Add to Home Screen", no background push on iOS Safari). For reliable push:

### Option A: Progressive Web App (PWA)
- Add a web app manifest + service worker for "Add to Home Screen"
- Works on Android Chrome, desktop browsers
- iOS Safari support is limited — notifications only work when the PWA is open or recently used
- Cheapest option, no app store overhead

### Option B: Native Wrapper (Capacitor / Expo)
- Wrap the existing Next.js web app in a native shell using [Capacitor](https://capacitorjs.com/) or build a thin React Native app with [Expo](https://expo.dev/)
- Full push notification support via APNs (iOS) and FCM (Android)
- Requires Apple Developer account ($99/yr) and Google Play Console ($25 one-time)
- Capacitor is simpler (reuse existing web code), Expo is better if we want truly native UI later

### Recommended Approach
Start with **Capacitor** — it wraps the existing web app with minimal code changes and adds native push via `@capacitor/push-notifications`. The app stays web-first, but players get reliable push on both iOS and Android. Only build a full native app if we need features like offline support or native gestures.

### Notification Triggers
- Lineup confirmed / changed (you've been added or removed)
- RSVP reminder (match in 3 days, haven't responded)
- Score submitted (your match result is in)
- Tournament match scheduled (new week's matchup posted)
- Announcement from captain
