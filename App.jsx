import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MapView from './MapView';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function App() {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const doSearch = async (q) => {
    if (!q) return;
    setLoading(true);
    try {
      const resp = await axios.get(`${API_BASE}/api/search`, { params: { terms: q } });
      setPlaces(resp.data.results || []);
    } catch (err) {
      console.error(err);
      alert('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e?.preventDefault();
    const cleaned = query.split(',').map(s=>s.trim()).filter(Boolean).join(',');
    doSearch(cleaned);
  };

  return (
    <div className="app">
      <div className="header">
        <div style={{fontWeight:700}}>HK Dish Search</div>
        <form className="searchbar" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Search dishes or flavors (Chinese / English). Use commas for multiple terms."
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
          <button type="submit">{loading ? 'Searching...' : 'Search'}</button>
        </form>
      </div>

      <div className="main">
        <div className="map-container">
          <MapView places={places} onSelect={setSelected} />
        </div>
        <div className="right-list">
          {places.map(p => (
            <div className="place-item" key={p.place_id} onClick={()=>setSelected(p)}>
              <img src={p.thumbnail ? (API_BASE + p.thumbnail) : 'https://via.placeholder.com/80x60?text=No+Photo'} alt="" />
              <div style={{flex:1}}>
                <div className="place-name">{p.name}</div>
                <div style={{fontSize:12,color:'#666'}}>{p.address}</div>
              </div>
            </div>
          ))}
          {!places.length && <div style={{padding:12}}>No results. Try searching a dish name (e.g. "wonton", "beef brisket")</div>}
        </div>
      </div>

      {selected && (
        <PlaceModal place={selected} onClose={()=>setSelected(null)} query={query} />
      )}
    </div>
  );
}

function PlaceModal({ place, onClose, query }) {
  const [details, setDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('photos');
  const [uploading, setUploading] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

  const fetchDetails = async () => {
    try {
      const r = await axios.get(`${API_BASE}/api/place`, { params: { place_id: place.place_id, terms: query } });
      setDetails(r.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(()=> {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const handleUpload = async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const fileInput = form.elements.photo;
    const dishInput = form.elements.dish;
    const uploaderInput = form.elements.uploader_name;

    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Please choose a photo to upload');
      return;
    }

    const fd = new FormData();
    fd.append('photo', fileInput.files[0]);
    fd.append('place_id', place.place_id);
    if (dishInput.value) fd.append('dish', dishInput.value);
    if (uploaderInput.value) fd.append('uploader_name', uploaderInput.value);

    setUploading(true);
    try {
      await axios.post(`${API_BASE}/api/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // refresh details to show the uploaded photo
      await fetchDetails();
      // clear the form
      form.reset();
      setActiveTab('photos');
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontWeight:700}}>{place.name}</div>
        <div><button className="small-btn" onClick={onClose}>Close</button></div>
      </div>

      <div style={{marginTop:8, color:'#666'}}>{place.address}</div>

      <div className="actions" style={{marginTop:12}}>
        <button className="small-btn" onClick={()=>setActiveTab('photos')}>More pictures of this dish</button>
        <button className="small-btn" onClick={()=>setActiveTab('other')}>Other dishes</button>
        <a className="small-btn" href={place.maps_url} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </div>

      <div style={{marginTop:12}}>
        {details === null && <div>Loading...</div>}

        {details && activeTab === 'photos' && (
          <>
            <div style={{fontWeight:600, marginBottom:8}}>User uploads</div>
            <div style={{display:'flex', gap:8, overflowX:'auto', marginBottom:8}}>
              {details.userPhotos && details.userPhotos.length ? details.userPhotos.map(p=>(
                <div key={p.id} style={{textAlign:'center'}}>
                  <img src={API_BASE + (p.preview_url || p.url)} alt="" style={{height:160, borderRadius:6}} />
                  <div style={{fontSize:12, color:'#555'}}>{p.dish || '—'}</div>
                  <div style={{fontSize:11, color:'#888'}}>{p.uploader_name || ''}</div>
                </div>
              )) : <div style={{padding:8}}>No user photos yet. Be the first to upload!</div>}
            </div>

            <form onSubmit={handleUpload} style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
              <input type="file" name="photo" accept="image/*" />
              <input type="text" name="dish" placeholder="Dish name (e.g. wonton)" />
              <input type="text" name="uploader_name" placeholder="Your name (optional)" />
              <button type="submit" className="small-btn" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
            </form>

            <div style={{fontWeight:600, marginBottom:8}}>Photos (Google)</div>
            <div style={{display:'flex', gap:8, overflowX:'auto'}}>
              {details.photos.length ? details.photos.map(p=>(
                <img key={p.photo_reference} src={API_BASE + p.url} alt="" style={{height:160, borderRadius:6}} />
              )) : <div>No photos available</div>}
            </div>

            <div style={{marginTop:10}}>
              <div style={{fontWeight:600}}>Reviews mentioning your dish</div>
              {details.reviewsWithTerms.length ? details.reviewsWithTerms.map((r,idx)=>(
                <div key={idx} style={{padding:8, borderBottom:'1px solid #eee'}}>
                  <div style={{fontWeight:600}}>{r.author_name} — {r.rating}★</div>
                  <div style={{fontSize:13}}>{r.text}</div>
                </div>
              )) : <div style={{padding:8}}>No reviews explicitly mention the search term(s). Showing recent reviews below.</div>}
              <div style={{marginTop:6}}>
                {details.reviews.map((r,idx)=>(
                  <div key={idx} style={{padding:8, borderBottom:'1px solid #fafafa'}}>
                    <div style={{fontWeight:600}}>{r.author_name} — {r.rating}★</div>
                    <div style={{fontSize:13}}>{r.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {details && activeTab === 'other' && (
          <>
            <div style={{fontWeight:600, marginBottom:8}}>Other common keywords from reviews</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {details.dishCandidates.map((c,i)=>(
                <div key={i} className="small-btn" style={{cursor:'default'}}>{c}</div>
              ))}
            </div>

            <div style={{marginTop:12}}>
              <div style={{fontWeight:600}}>All reviews</div>
              {details.reviews.map((r,idx)=>(
                <div key={idx} style={{padding:8, borderBottom:'1px solid #eee'}}>
                  <div style={{fontWeight:600}}>{r.author_name} — {r.rating}★</div>
                  <div style={{fontSize:13}}>{r.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}