/**
 * GTC UNIVERSAL LIVE TRACKER PIXEL
 * Pasang skrip ini pada website eksternal (misal: https://livenation-bts-ticket.vercel.app/)
 * Skrip ini akan secara otomatis memantau pengunjung, perangkat, dan klik aktivitas
 * lalu mengirimkannya secara realtime ke Admin Dashboard GTC.
 */
(function() {
  // Otomatis mendeteksi endpoint backend GTC
  // Jika script dipanggil dari domain backend, gunakan domain skrip tersebut
  var currentScript = document.currentScript;
  var backendUrl = 'http://localhost:3000'; // Default fallback

  if (currentScript && currentScript.src) {
    try {
      var scriptUrl = new URL(currentScript.src);
      backendUrl = scriptUrl.origin;
    } catch (e) {}
  }

  // 1. Dapatkan atau buat Unique Visitor ID
  function getVisitorId() {
    var vidKey = 'gtc_uid_tracker';
    var vid = null;
    try {
      vid = localStorage.getItem(vidKey);
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        localStorage.setItem(vidKey, vid);
      }
    } catch (e) {
      vid = 'v_' + Math.random().toString(36).substring(2, 9);
    }
    return vid;
  }

  var visitorId = getVisitorId();

  // Helper pengiriman data ke backend
  function sendBeaconData(endpoint, payload) {
    var fullUrl = backendUrl + endpoint;
    var dataStr = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(fullUrl, new Blob([dataStr], { type: 'application/json' }));
    } else {
      fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: dataStr,
        keepalive: true
      }).catch(function() {});
    }
  }

  // 2. Track Kunjungan Halaman (Page View)
  function trackPageView() {
    sendBeaconData('/api/public/track/view', {
      visitorId: visitorId,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    });
  }

  // 3. Track Interaksi Klik
  function trackClick(elementType, elementLabel, metadata) {
    sendBeaconData('/api/public/track/click', {
      visitorId: visitorId,
      elementType: elementType || 'CLICK',
      elementLabel: elementLabel || 'Element Clicked',
      metadata: Object.assign({
        pageUrl: window.location.href,
        hostname: window.location.hostname
      }, metadata || {})
    });
  }

  // Setup Event Listener Otomatis untuk Semua Elemen Interaktif
  function initAutoClickListener() {
    document.addEventListener('click', function(e) {
      var target = e.target;
      // Cari elemen terdekat yang bermakna (a, button, input, div khusus)
      var clickable = target.closest('button, a, input[type="submit"], input[type="button"], [role="button"], .seat-block, .ticket-card');
      
      if (clickable) {
        var label = clickable.innerText ? clickable.innerText.trim().replace(/\s+/g, ' ').substring(0, 80) : '';
        if (!label) {
          label = clickable.getAttribute('aria-label') || clickable.getAttribute('title') || clickable.getAttribute('id') || clickable.tagName;
        }

        var elementType = clickable.tagName.toUpperCase();
        if (clickable.tagName.toLowerCase() === 'a') {
          elementType = 'LINK_CLICK';
        } else if (clickable.tagName.toLowerCase() === 'button') {
          elementType = 'BUTTON_CLICK';
        }

        trackClick(elementType, label, {
          href: clickable.href || null,
          id: clickable.id || null,
          className: clickable.className || null
        });
      }
    }, true);
  }

  // Jalankan saat halaman siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      trackPageView();
      initAutoClickListener();
    });
  } else {
    trackPageView();
    initAutoClickListener();
  }

  // Ekspos ke global window jika ingin digunakan secara manual
  window.GTCTracker = {
    visitorId: visitorId,
    trackClick: trackClick,
    trackPageView: trackPageView
  };

  console.log('[GTC Tracker] Active & connected to:', backendUrl);
})();
