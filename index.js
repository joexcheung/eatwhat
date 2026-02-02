/**
 * Server with user-uploaded photo support and server-side thumbnail generation.
 *
 * - POST /api/upload
 *    Accepts multipart/form-data:
 *      - photo (file)
 *      - place_id (string)
 *      - dish (string, optional)
 *      - uploader_name (string, optional)
 *
 * Uploaded files are saved under server/uploads:
 * - original: <uuid>.<ext>
 * - thumb: <uuid>_thumb.jpg  (width 400px, quality ~80)
 * - preview: <uuid>_preview.jpg (width 160px)
 *
 * Metadata file: server/uploads/metadata.json
 *
 * Notes:
 * - For production use S3/GCS + DB and run virus scanning.
 * - On some systems (e.g. Alpine) sharp needs libvips build deps.
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PORT = process.env.PORT || 4000;

if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_API_KEY in environment');
  process.exit(1);
}

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Metadata file
const META_FILE = path.join(UPLOAD_DIR, 'metadata.json');
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify([]));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Simple metadata helpers
function readMetadata() {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed reading metadata', e);
    return [];
  }
}
function writeMetadata(arr) {
  fs.writeFileSync(META_FILE, JSON.stringify(arr, null, 2));
}

// Multer setup - accept only images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});
function fileFilter (req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'), false);
  }
  cb(null, true);
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 12 * 1024 * 1024 } }); // 12MB limit

// Helper: build Google Maps place URL
function googleMapsUrl(place_id) {
  return `https://www.google.com/maps/place/?q=place_id:${place_id}`;
}

// Utility: generate resized images (returns generated filenames)
async function generateResizedVariants(originalFilePath) {
  const parsed = path.parse(originalFilePath);
  const basename = parsed.name; // uuid
  const thumbFilename = `${basename}_thumb.jpg`;
  const previewFilename = `${basename}_preview.jpg`;
  const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
  const previewPath = path.join(UPLOAD_DIR, previewFilename);

  // Create thumb (400px width, keep aspect ratio)
  await sharp(originalFilePath)
    .rotate() // respect EXIF orientation
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);

  // Create preview (160px width)
  await sharp(originalFilePath)
    .rotate()
    .resize({ width: 160, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toFile(previewPath);

  return { thumbFilename, previewFilename };
}

// Upload endpoint
app.post('/api/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing photo file' });

    const { place_id, dish = '', uploader_name = '' } = req.body;
    if (!place_id) {
      // remove saved file to avoid orphan
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing place_id' });
    }

    // Generate resized variants
    let thumbFilename = null;
    let previewFilename = null;
    try {
      const { thumbFilename: tfn, previewFilename: pfn } = await generateResizedVariants(req.file.path);
      thumbFilename = tfn;
      previewFilename = pfn;
    } catch (err) {
      console.error('Thumbnail generation failed for', req.file.filename, err);
      // proceed without thumbnails; original remains
    }

    const metadata = readMetadata();

    const record = {
      id: uuidv4(),
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      thumb_url: thumbFilename ? `/uploads/${thumbFilename}` : null,
      preview_url: previewFilename ? `/uploads/${previewFilename}` : null,
      place_id: place_id,
      dish: dish || '',
      uploader_name: uploader_name || '',
      created_at: new Date().toISOString()
    };

    metadata.push(record);
    writeMetadata(metadata);

    res.status(201).json({ message: 'Uploaded', record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// /api/search?terms=dish1,dish2
app.get('/api/search', async (req, res) => {
  try {
    const termsRaw = req.query.terms || '';
    const terms = termsRaw.split(',').map(t => t.trim()).filter(Boolean);
    if (terms.length === 0) {
      return res.status(400).json({ error: 'Missing terms parameter' });
    }

    const query = `${terms.map(t => t.includes(' ') ? \`"\${t}"\` : t).join(' OR ')} restaurants in Hong Kong`;

    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
    const textResp = await axios.get(textSearchUrl, {
      params: {
        query,
        key: GOOGLE_API_KEY,
        type: 'restaurant',
        language: 'zh-TW'
      }
    });

    const places = textResp.data.results || [];
    const limited = places.slice(0, 20);

    const detailsPromises = limited.map(async (p) => {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json`;
      const detailsResp = await axios.get(detailsUrl, {
        params: {
          place_id: p.place_id,
          fields: 'name,geometry,formatted_address,photos,place_id,types,opening_hours',
          key: GOOGLE_API_KEY,
          language: 'zh-TW'
        }
      });
      const details = detailsResp.data.result || {};
      let thumbnail = null;
      if (details.photos && details.photos.length > 0) {
        thumbnail = `/api/photo?photoreference=${details.photos[0].photo_reference}&maxwidth=400`;
      } else {
        // If the place has user uploads with thumbs, consider using one (optional)
        const metadata = readMetadata();
        const userForPlace = metadata.find(m => m.place_id === (details.place_id || p.place_id) && m.thumb_url);
        if (userForPlace) thumbnail = userForPlace.thumb_url;
      }
      return {
        place_id: details.place_id || p.place_id,
        name: details.name || p.name,
        address: details.formatted_address || p.formatted_address,
        location: details.geometry?.location || p.geometry?.location,
        types: details.types || p.types,
        thumbnail,
        maps_url: googleMapsUrl(details.place_id || p.place_id)
      };
    });

    const results = await Promise.all(detailsPromises);
    res.json({ query, results });
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).json({ error: 'Search failed', details: err?.message });
  }
});

// /api/place?place_id=...&terms=term1,term2
app.get('/api/place', async (req, res) => {
  try {
    const place_id = req.query.place_id;
    const termsRaw = req.query.terms || '';
    const terms = termsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

    if (!place_id) return res.status(400).json({ error: 'Missing place_id' });

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json`;
    const detailsResp = await axios.get(detailsUrl, {
      params: {
        place_id,
        fields: 'name,geometry,formatted_address,photos,place_id,review,reviews',
        key: GOOGLE_API_KEY,
        language: 'zh-TW'
      }
    });

    const place = detailsResp.data.result || {};

    const photos = (place.photos || []).map(p => ({
      photo_reference: p.photo_reference,
      url: `/api/photo?photoreference=${p.photo_reference}&maxwidth=800`
    }));

    const reviews = (place.reviews || []).map(r => ({
      author_name: r.author_name,
      text: r.text,
      rating: r.rating,
      relative_time_description: r.relative_time_description,
      author_url: r.author_url
    }));

    const reviewsWithTerms = reviews.filter(r => {
      const text = (r.text || '').toLowerCase();
      return terms.length === 0 ? false : terms.some(t => text.includes(t));
    });

    const allReviewText = reviews.map(r => r.text || '').join(' ').toLowerCase();
    const wordCounts = {};
    allReviewText.split(/\W+/).forEach(w => {
      if (w.length <= 1) return;
      if (['the','and','of','a','is','in','to','with','on'].includes(w)) return;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
    const candidates = Object.entries(wordCounts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,10)
      .map(e=>e[0]);

    // Attach user-uploaded photos from metadata
    const metadata = readMetadata();
    const userPhotos = metadata
      .filter(m => m.place_id === place_id)
      .filter(m => {
        if (terms.length === 0) return true;
        const dishLabel = (m.dish || '').toLowerCase();
        return terms.some(t => dishLabel.includes(t));
      })
      .map(m => ({
        id: m.id,
        url: m.url,
        thumb_url: m.thumb_url,
        preview_url: m.preview_url,
        dish: m.dish,
        uploader_name: m.uploader_name,
        created_at: m.created_at
      }));

    res.json({
      place_id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      location: place.geometry?.location,
      photos,
      reviews,
      reviewsWithTerms,
      dishCandidates: candidates,
      maps_url: googleMapsUrl(place.place_id),
      userPhotos
    });
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).json({ error: 'Place fetch failed', details: err?.message });
  }
});

// /api/photo?photoreference=...&maxwidth=800
app.get('/api/photo', async (req, res) => {
  try {
    const ref = req.query.photoreference;
    const maxwidth = req.query.maxwidth || 800;
    if (!ref) return res.status(400).send('Missing photoreference');

    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo`;
    const redirectUrl = `${photoUrl}?maxwidth=${maxwidth}&photoreference=${ref}&key=${GOOGLE_API_KEY}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).send('Photo fetch failed');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Uploads served at /uploads (folder: ${UPLOAD_DIR})`);
});