## Summary

This patch replaces the hard-coded footer on the Login / Auth screen with a runtime-backed release identity (app version and short git SHA) fetched from /api/system/version. It also adds a small mobile CSS file to make room for the fixed bottom navigation so the footer is not visually overlapped on narrow screens.

### Changes
- apps/web/src/pages/LoginPage.tsx
  - Fetches `/api/system/version` and displays `v<appVersion>` and `build <short-sha>` in the auth footer (with a fallback when the endpoint is unavailable).
- apps/web/src/auth-footer.css
  - Adds a responsive rule to pad the auth page and main content on small screens to account for the fixed bottom-nav. Shows the bottom-nav on mobile.

### Testing
- Run the web app and verify the login page footer shows the runtime version and short SHA when the API is reachable.
- Resize to mobile and verify the footer is not covered by the bottom navigation.

---

This PR was created by an automated assistant to apply the requested fix.
