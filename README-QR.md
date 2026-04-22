# RT-SC — QR code pré-inscription

This zip adds a QR code widget to the admin Inscriptions tab that generates
a scannable code linking to the public `/inscription` page.

## Installation

This feature requires a new npm dependency. After extracting the zip, run:

```bash
cd ~/RT-SC
npm install qrcode
npm install -D @types/qrcode
```

Both packages combined are ~45 KB gzipped. They work fully offline (no
external API calls — QR generation happens in the browser).

## What's in the zip

- `src/routes/admin/tabs/inscriptions/QRPreInscriptionCard.tsx` — new widget
- `src/routes/admin/tabs/inscriptions/InscriptionsAdminTab.tsx` — wires it in

## How to use (for school admins)

1. Open the admin dashboard → Inscriptions tab
2. Scroll to the bottom — the QR card is always visible
3. Two actions:
   - **Télécharger (PNG)** downloads a high-resolution 1024×1024 QR as
     `QR-pre-inscription-<school-name>.png`. Print on A4 or larger.
   - **Copier le lien** copies the raw URL to the clipboard for sharing
     via WhatsApp, Facebook, email, etc.

The QR encodes `https://<your-domain>/inscription` based on the current
browser origin, so it adapts automatically to localhost, ngrok tunnel, or
the production Firebase Hosting URL.

## Known limitation

The QR URL is origin-relative — on localhost during dev, the QR will
only work if the parent's phone can reach your machine. For production,
after deploying to Firebase Hosting, the QR will point to the real
school domain.
