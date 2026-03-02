// sw.js - Enhanced Service Worker with CDN fallback support (MySQL Version)
const CACHE_NAME = 'wfms-cache-v1';
const DYNAMIC_CACHE = 'wfms-dynamic-v1';
const FALLBACK_CACHE = 'wfms-fallback-v1';

// Core app files to cache immediately
const CORE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/favicon.ico',
  '/manifest.json',
  '/offline.html'
];

// CDN URLs to cache dynamically - REMOVED gstatic.com (Firebase)
const CDN_PATTERNS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'stackpath.bootstrapcdn.com'
];

// Cache version for cleanup
const CURRENT_CACHES = [CACHE_NAME, DYNAMIC_CACHE, FALLBACK_CACHE];

// Install event: cache core files
self.addEventListener('install', (e) => {
  console.log('Service Worker: Installing...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching core files');
        return cache.addAll(CORE_FILES).catch(err => {
          console.error('Failed to cache some core files:', err);
          // Continue even if some files fail
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activate event: clean old caches
self.addEventListener('activate', (e) => {
  console.log('Service Worker: Activating...');
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (!CURRENT_CACHES.includes(key)) {
            console.log('Service Worker: Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch event: intelligent caching with fallbacks
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') return;
  
  // Handle different types of requests
  if (isCDNRequest(url)) {
    e.respondWith(handleCDNRequest(e.request));
  } else if (isPageNavigation(e.request)) {
    e.respondWith(handleNavigationRequest(e.request));
  } else {
    e.respondWith(handleGeneralRequest(e.request));
  }
});

// Check if request is to a CDN
function isCDNRequest(url) {
  return CDN_PATTERNS.some(pattern => url.hostname.includes(pattern));
}

// Check if request is page navigation
function isPageNavigation(request) {
  return request.mode === 'navigate' || 
         (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

// Update the handleCDNRequest function in sw.js
async function handleCDNRequest(request) {
  const url = request.url;
  
  // Special handling for unpkg (known CORS issues)
  if (url.includes('unpkg.com')) {
    return handleUnpkgRequest(request);
  }
  
  try {
    // Try network first with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const networkResponse = await fetch(request, { 
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit'
    });
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      console.log('✅ CDN cached:', url);
      return networkResponse;
    }
    
    throw new Error(`HTTP ${networkResponse.status}`);
    
  } catch (error) {
    console.warn('⚠️ CDN fetch failed:', url, error.message);
    
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('✅ Serving from cache:', url);
      return cachedResponse;
    }
    
    // Try alternative CDN
    const alternativeUrl = getAlternativeCDNUrl(url);
    if (alternativeUrl) {
      try {
        console.log('🔄 Trying alternative CDN:', alternativeUrl);
        
        const altResponse = await fetch(alternativeUrl, {
          mode: 'cors',
          credentials: 'omit'
        });
        
        if (altResponse.ok) {
          const cache = await caches.open(FALLBACK_CACHE);
          cache.put(request, altResponse.clone());
          console.log('✅ Alternative CDN succeeded:', alternativeUrl);
          return altResponse;
        }
      } catch (altError) {
        console.warn('⚠️ Alternative CDN also failed:', alternativeUrl);
      }
    }
    
    // Return empty response with library placeholder
    return getEmptyResponseForRequest(request, url);
  }
}

// Special handler for unpkg (known CORS issues)
async function handleUnpkgRequest(request) {
  const url = request.url;
  
  // Try jsDelivr first (better CORS)
  const jsDelivrUrl = url.replace('unpkg.com', 'cdn.jsdelivr.net/npm');
  
  try {
    console.log('🔄 Trying jsDelivr for unpkg resource:', jsDelivrUrl);
    const response = await fetch(jsDelivrUrl, {
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (response.ok) {
      const cache = await caches.open(FALLBACK_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    console.warn('⚠️ jsDelivr fallback failed:', error.message);
  }
  
  // Try Cloudflare
  const cloudflareUrl = url.replace('unpkg.com/html5-qrcode@', 'cdnjs.cloudflare.com/ajax/libs/html5-qrcode/')
                           .replace('/minified/html5-qrcode.min.js', '/html5-qrcode.min.js');
  
  try {
    console.log('🔄 Trying Cloudflare:', cloudflareUrl);
    const response = await fetch(cloudflareUrl, {
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (response.ok) {
      const cache = await caches.open(FALLBACK_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    console.warn('⚠️ Cloudflare fallback failed:', error.message);
  }
  
  // Return placeholder
  return getEmptyResponseForRequest(request, url);
}

// Update getAlternativeCDNUrl function - REMOVED FIREBASE
function getAlternativeCDNUrl(originalUrl) {
  // HTML5-QRCode specific handling
  if (originalUrl.includes('unpkg.com/html5-qrcode')) {
    const version = originalUrl.match(/@(\d+\.\d+\.\d+)/)?.[1] || '2.3.7';
    return `https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/${version}/html5-qrcode.min.js`;
  }
  
  // Bootstrap
  if (originalUrl.includes('bootstrap@')) {
    const version = originalUrl.match(/@(\d+\.\d+\.\d+)/)?.[1];
    if (version && originalUrl.includes('bootstrap.min.css')) {
      return `https://cdnjs.cloudflare.com/ajax/libs/bootstrap/${version}/css/bootstrap.min.css`;
    }
  }
  
  // Bootstrap Icons
  if (originalUrl.includes('bootstrap-icons@')) {
    const version = originalUrl.match(/@(\d+\.\d+\.\d+)/)?.[1];
    if (version) {
      return `https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/${version}/font/bootstrap-icons.css`;
    }
  }
  
  // jsPDF
  if (originalUrl.includes('jspdf@')) {
    const version = originalUrl.match(/@(\d+\.\d+\.\d+)/)?.[1];
    if (version) {
      return `https://cdnjs.cloudflare.com/ajax/libs/jspdf/${version}/jspdf.umd.min.js`;
    }
  }
  
  // Chart.js
  if (originalUrl.includes('chart.js@')) {
    const version = originalUrl.match(/@(\d+\.\d+\.\d+)/)?.[1];
    if (version) {
      return `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/${version}/chart.umd.min.js`;
    }
  }
  
  // Socket.io
  if (originalUrl.includes('socket.io')) {
    const version = originalUrl.match(/socket\.io\/(\d+\.\d+\.\d+)/)?.[1];
    if (version) {
      return `https://cdnjs.cloudflare.com/ajax/libs/socket.io/${version}/socket.io.min.js`;
    }
  }
  
  // Generic fallback for jsDelivr -> Cloudflare
  if (originalUrl.includes('cdn.jsdelivr.net')) {
    return originalUrl.replace('cdn.jsdelivr.net', 'cdnjs.cloudflare.com/ajax/libs')
                     .replace('/npm/', '/');
  }
  
  return null;
}

// Handle navigation requests (HTML pages)
async function handleNavigationRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache HTML responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('Navigation fetch failed, serving from cache or offline page');
    
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Try cached index.html
    const indexResponse = await caches.match('/index.html');
    if (indexResponse) {
      return indexResponse;
    }
    
    // Last resort: offline page
    const offlineResponse = await caches.match('/offline.html');
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Return simple offline message
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Offline</title></head>
        <body style="background:#0f172a; color:white; text-align:center; padding:50px;">
          <h1>📡 Offline</h1>
          <p>Please check your internet connection</p>
          <button onclick="window.location.reload()">Retry</button>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Handle general requests (images, assets, etc.)
async function handleGeneralRequest(request) {
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return fetch(request);
  }
  
  try {
    // Try cache first for general requests
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Fetch in background to update cache
      updateCacheInBackground(request);
      return cachedResponse;
    }
    
    // If not in cache, try network
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('Request failed:', request.url, error.message);
    
    // Return custom 503 for failed requests
    return new Response('Resource unavailable', { 
      status: 503, 
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Update cache in background without blocking response
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse);
      console.log('✅ Background cache updated:', request.url);
    }
  } catch (error) {
    // Silently fail - we already served from cache
  }
}

// Get empty response based on request type - REMOVED firebase placeholder
function getEmptyResponseForRequest(request, url) {
  const fileName = url.split('/').pop() || '';
  
  if (request.destination === 'style' || fileName.endsWith('.css')) {
    return new Response('/* CSS temporarily unavailable */', { 
      status: 200, 
      headers: { 
        'Content-Type': 'text/css',
        'Access-Control-Allow-Origin': '*'
      } 
    });
  }
  
  if (request.destination === 'script' || fileName.endsWith('.js')) {
    const scriptContent = `
      // Script temporarily unavailable: ${url}
      console.warn('⚠️ Script failed to load:', '${url}');
      // Create placeholder for common libraries
      if (window.io === undefined) window.io = function() { return { on: function() {}, emit: function() {} }; };
      if (window.jspdf === undefined) window.jspdf = { jsPDF: function() { return { addImage: function() {}, save: function() {} }; } };
      if (window.Chart === undefined) window.Chart = function() { return { destroy: function() {} }; };
      if (window.Html5Qrcode === undefined) window.Html5Qrcode = function() { return { start: function() {}, stop: function() {} }; };
    `;
    
    return new Response(scriptContent, { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      } 
    });
  }
  
  if (request.destination === 'image' || fileName.match(/\.(jpg|jpeg|png|gif|svg|ico)$/)) {
    // Return a 1x1 transparent pixel
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache'
      }
    });
  }
  
  // Default empty response
  return new Response('', { 
    status: 503, 
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Clean old caches periodically
self.addEventListener('message', (event) => {
  if (event.data === 'clean-caches') {
    console.log('Service Worker: Cleaning old caches');
    caches.keys().then(keys => {
      keys.forEach(key => {
        if (!CURRENT_CACHES.includes(key)) {
          console.log('Removing cache:', key);
          caches.delete(key);
        }
      });
    });
  }
  
  // Skip waiting and become active
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('Service Worker: Background sync triggered');
    // Implement data sync logic here
  }
});

// Log service worker lifecycle
console.log('Service Worker: Loaded and ready (MySQL version)');