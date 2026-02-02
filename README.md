# HK Dish Search — Prototype (repo-ready)

This repository is a runnable prototype for searching restaurants in Hong Kong by dish or flavor, with support for:
- Searching by dish/flavor (Chinese or English, multiple comma-separated terms)
- Map-based results + right-hand list with thumbnails
- Google Places photos (proxied)
- User-uploaded photos associated with a place and a dish
- Server-side thumbnail generation and automatic resizing (using sharp)

Repository layout:
- server/ — Express backend (Places API proxy, upload handling, image resizing)
- client/ — React + Vite frontend (Leaflet map)

Quick start (local)

1. Clone or create repo, then create .env files (see examples below).

2. Start server:
   - cd server
   - npm install
   - Create `.env` with:
     GOOGLE_API_KEY=your_google_api_key_here
     PORT=4000
   - npm run start

3. Start client:
   - cd client
   - npm install
   - Create `.env` with:
     VITE_API_BASE=http://localhost:4000
   - npm run dev
   - Open the URL printed by Vite (usually http://localhost:5173)

Notes and requirements
- You must enable Places API (Places API Web Service) and set up billing in Google Cloud.
- The server proxies Place Photos and Place Details so your Google API key is not exposed in the browser.
- Uploaded files are stored in server/uploads and metadata in server/uploads/metadata.json.
- Thumbnails and preview images are generated server-side using sharp. On Alpine Linux or minimal containers you may need to install build dependencies for sharp/libvips — see sharp installation docs: https://sharp.pixelplumbing.com/install

Production suggestions
- Use S3 or GCS for uploads and a database (Postgres/Firestore) for metadata.
- Add authentication, moderation endpoints (delete photos), rate-limiting, malware scanning, and signed URLs for uploads.
- Serve images via CDN and generate WebP variants.

If you want, I can also:
- Create a migration script to regenerate thumbnails for existing uploads.
- Provide a ready zip file hosted somewhere (I can't host files directly here, but I can provide a script to generate the zip locally).